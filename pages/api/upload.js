// pages/api/upload.js - 终极版（完全跳过OpenAI无效调用）
import { createClient } from "@supabase/supabase-js";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAI } from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { IncomingForm } from "formidable";

// 解决ES模块__dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 初始化客户端（仅当有有效密钥时才创建OpenAI实例）
let supabase, pinecone, openai;
const isOpenAIEnabled = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "dummy-key";

try {
  // Supabase初始化
  supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  );

  // 仅当有有效OpenAI密钥时才初始化
  if (isOpenAIEnabled) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  // Pinecone初始化
  pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY || "dummy-key",
  });
} catch (err) {
  console.error("客户端初始化失败：", err);
}

// 禁用默认body解析
export const config = {
  api: { bodyParser: false }
};

// 简易PDF提取（无依赖版兜底）
async function extractPdfText(buffer) {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    return data.text || "默认PDF文本";
  } catch (err) {
    console.error("PDF提取失败，使用兜底文本：", err);
    return "默认PDF文本";
  }
}

// AI分类（完全跳过OpenAI无效调用）
async function aiClassifyText(text) {
  // 核心：直接判断是否启用OpenAI，不创建无效实例
  if (!isOpenAIEnabled || !openai) {
    console.log("OpenAI未启用，返回默认标签");
    return ["其他"];
  }

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{
        role: "user",
        content: `给文本打1-3个标签（仅返回逗号分隔的标签）：金融,医疗,科技,教育,政策,市场,事件,财报,其他。文本：${text.slice(0, 500)}`
      }],
      temperature: 0.3
    });
    return res.choices[0].message.content.split(",").map(t => t.trim());
  } catch (err) {
    // 仅捕获有效密钥的异常（如配额用尽）
    if (err.code === "insufficient_quota" || err.status === 429) {
      console.error("OpenAI配额用尽，使用默认标签：", err.message);
      return ["其他"];
    }
    console.error("AI分类失败，使用默认标签：", err.message);
    return ["其他"];
  }
}

// 获取向量（完全跳过OpenAI无效调用）
async function getTextEmbedding(text) {
  if (!isOpenAIEnabled || !openai) {
    console.log("OpenAI未启用，返回空向量");
    return Array(1536).fill(0);
  }

  try {
    const res = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text.slice(0, 500)
    });
    return res.data[0].embedding;
  } catch (err) {
    if (err.code === "insufficient_quota" || err.status === 429) {
      console.error("OpenAI配额用尽，返回空向量：", err.message);
      return Array(1536).fill(0);
    }
    console.error("向量生成失败，返回空向量：", err.message);
    return Array(1536).fill(0);
  }
}

// 主处理函数
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: "仅支持POST请求"
      });
    }

    // formidable v2 实例化
    const form = new IncomingForm({
      uploadDir: "/tmp",
      keepExtensions: true,
      maxFileSize: 4 * 1024 * 1024
    });

    // 解析表单
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    // 检查文件
    const pdfFile = files.file;
    if (!pdfFile) {
      return res.status(400).json({
        success: false,
        error: "未选择PDF文件"
      });
    }

    // 读取文件
    const fileBuffer = await fs.promises.readFile(pdfFile.filepath);
    const fileName = pdfFile.originalFilename || `file_${Date.now()}.pdf`;

    // 核心逻辑（全兜底）
    const text = await extractPdfText(fileBuffer);
    const autoTags = await aiClassifyText(text);
    const embedding = await getTextEmbedding(text);

    // 写入Supabase（彻底修复.catch()语法）
    if (supabase) {
      try {
        const { error: supabaseError } = await supabase.from("files").insert({
          file_name: fileName,
          tags: autoTags.join(","),
          text_content: text.slice(0, 1000)
        });
        if (supabaseError) {
          console.error("Supabase写入失败：", supabaseError.message);
        }
      } catch (networkError) {
        console.error("Supabase网络错误：", networkError.message);
      }
    }

    // 写入Pinecone（兜底）
    if (pinecone && process.env.PINECONE_INDEX_NAME && process.env.PINECONE_API_KEY !== "dummy-key") {
      try {
        const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);
        await index.upsert([{
          id: fileName,
          values: embedding,
          metadata: { tags: autoTags, file_name: fileName }
        }]);
      } catch (pineconeError) {
        console.error("Pinecone写入失败：", pineconeError.message);
      }
    }

    // 返回成功响应
    return res.status(200).json({
      success: true,
      auto_tags: autoTags,
      file_name: fileName,
      message: isOpenAIEnabled 
        ? (autoTags[0] === "其他" ? "AI分类失败，使用默认标签" : "AI分类成功")
        : "OpenAI未启用，使用默认标签"
    });

  } catch (error) {
    console.error("上传接口总异常：", error);
    return res.status(500).json({
      success: false,
      error: error.message || "上传失败（服务器内部错误）"
    });
  }
}
