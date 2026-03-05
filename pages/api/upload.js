// pages/api/upload.js 完整修复版
import { createClient } from "@supabase/supabase-js";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAI } from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
// 关键修复：formidable正确导入方式（v3+兼容）
import formidable from "formidable";

// 解决ES模块__dirname问题
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 初始化客户端（带异常捕获）
let supabase, pinecone, openai;
try {
  // Supabase初始化
  supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // OpenAI初始化
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Pinecone初始化
  pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });
} catch (error) {
  console.error("客户端初始化失败：", error);
}

// 禁用Next.js默认的body解析
export const config = {
  api: {
    bodyParser: false,
  },
};

// 简易PDF文本提取（依赖pdf-parse）
async function extractPdfText(buffer) {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch (error) {
    console.error("PDF文本提取失败：", error);
    return "";
  }
}

// AI分类文本（兜底返回"其他"）
async function aiClassifyText(text) {
  if (!openai || !text) return ["其他"];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `请给以下文本分类，仅返回1-3个标签（用逗号分隔），可选标签：金融,医疗,科技,教育,政策,市场,事件,财报,其他。文本：${text.slice(0, 500)}`,
        },
      ],
      temperature: 0.3,
    });

    return completion.choices[0].message.content.split(",").map((tag) => tag.trim());
  } catch (error) {
    console.error("AI分类失败：", error);
    return ["其他"];
  }
}

// 获取文本向量（兜底返回空向量）
async function getTextEmbedding(text) {
  if (!openai || !text) return Array(1536).fill(0);

  try {
    const embedding = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text.slice(0, 500),
    });
    return embedding.data[0].embedding;
  } catch (error) {
    console.error("向量生成失败：", error);
    return Array(1536).fill(0);
  }
}

// 主处理函数（全量异常捕获）
export default async function handler(req, res) {
  // 确保始终返回合法JSON
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: "仅支持POST请求",
      });
    }

    // 关键修复：formidable v3+正确创建IncomingForm实例
    const form = formidable({
      uploadDir: path.join(process.cwd(), "tmp"), // Vercel兼容的临时目录
      keepExtensions: true,
      maxFileSize: 4 * 1024 * 1024, // 4MB限制
    });

    // 解析表单数据（Promise封装）
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    // 检查上传的PDF文件
    const pdfFile = files.file ? files.file[0] : null;
    if (!pdfFile) {
      return res.status(400).json({
        success: false,
        error: "请选择PDF文件上传",
      });
    }

    // 读取文件缓冲区
    const fileBuffer = await fs.promises.readFile(pdfFile.filepath);
    const fileName = pdfFile.originalFilename || `file_${Date.now()}.pdf`;

    // 核心业务逻辑
    const textContent = await extractPdfText(fileBuffer);
    const autoTags = await aiClassifyText(textContent);
    const embedding = await getTextEmbedding(textContent);

    // 写入Supabase数据库
    if (supabase) {
      try {
        await supabase.from("files").insert({
          file_name: fileName,
          tags: autoTags.join(","), // 适配text类型
          text_content: textContent.slice(0, 1000),
        });
      } catch (error) {
        console.error("Supabase写入失败：", error);
      }
    }

    // 写入Pinecone（可选，失败不影响核心流程）
    if (pinecone && process.env.PINECONE_INDEX_NAME) {
      try {
        const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);
        await index.upsert([
          {
            id: fileName,
            values: embedding,
            metadata: { tags: autoTags, file_name: fileName },
          },
        ]);
      } catch (error) {
        console.error("Pinecone写入失败：", error);
      }
    }

    // 返回成功响应（标准JSON）
    return res.status(200).json({
      success: true,
      auto_tags: autoTags,
      file_name: fileName,
    });
  } catch (error) {
    // 捕获所有异常，返回标准JSON
    console.error("上传接口异常：", error);
    return res.status(500).json({
      success: false,
      error: error.message || "服务器内部错误，上传失败",
    });
  }
}
