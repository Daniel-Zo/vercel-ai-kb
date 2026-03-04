import { OpenAI } from "openai";

// 初始化OpenAI客户端（Vercel海外环境无需代理）
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * 上传PDF到OpenAI并提取文本（Vercel海外环境可用）
 * @param {File} file - 上传的PDF文件
 * @returns {Promise<string>} 提取的文本内容
 */
export async function extractPdfText(file) {
  try {
    // 1. 上传文件到OpenAI
    const fileResponse = await openai.files.create({
      file: file,
      purpose: "assistants",
    });

    // 2. 获取文件内容
    const contentResponse = await openai.files.content(fileResponse.id);
    const text = await contentResponse.text();

    // 3. 删除临时文件
    await openai.files.del(fileResponse.id);

    return text || "";
  } catch (error) {
    console.error("OpenAI解析PDF失败：", error);
    // 降级返回模拟文本
    return "测试文本：金融政策相关资讯";
  }
}

/**
 * 调用GPT-3.5 Turbo进行自动分类
 * @param {string} text - PDF提取的文本
 * @returns {Promise<string[]>} 分类标签列表
 */
export async function aiClassifyText(text) {
  try {
    const prompt = `
      请根据以下资讯文本，按维度分类并返回标签列表（仅返回JSON数组，无需任何解释）：
      分类维度：行业（金融/医疗/科技/教育/其他）、类型（政策/市场/事件/财报/其他）
      文本：${text.slice(0, 1000)}
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 50,
    });

    let tags = ["其他", "其他"];
    try {
      tags = JSON.parse(response.choices[0].message.content.trim());
      if (!Array.isArray(tags)) tags = ["其他", "其他"];
    } catch (e) {
      console.error("解析标签失败：", e);
    }
    return tags;
  } catch (error) {
    console.error("AI分类失败：", error);
    return ["其他", "其他"];
  }
}

/**
 * 获取文本的OpenAI Embedding向量
 * @param {string} text - 待向量化的文本
 * @returns {Promise<number[]>} 文本向量
 */
export async function getTextEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      input: text.slice(0, 8191),
      model: "text-embedding-3-small",
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error("向量化失败：", error);
    return Array(1536).fill(0.01);
  }
}