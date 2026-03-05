// pages/api/upload.js - formidable v2 兼容版
import { createClient } from "@supabase/supabase-js";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAI } from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
// formidable v2 正确导入方式
import { IncomingForm } from "formidable";

// 解决ES模块__dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 初始化客户端
let supabase, pinecone, openai;
try {
  supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
} catch (err) {
  console.error("客户端初始化失败：", err);
}

// 禁用默认body解析
export const config = {
  api: { bodyParser: false }
};

// 简易PDF提取
async function extractPdfText(buffer) {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch (err) {
    console.error("PDF提取失败：", err);
    return "";
  }
}

// AI分类（兜底）
async function aiClassifyText(text) {
  if (!openai || !text) return ["其他"];
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
    console.error("AI分类失败：", err);
    return ["其他"];
  }
}

// 获取向量（兜底）
async function getTextEmbedding(text) {
  if (!openai || !text) return Array(1536).fill(0);
  try {
    const res = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text.slice(0, 500)
    });
    return res.data[0].embedding;
  } catch (err) {
    console.error("向量生成失败：", err);
    return Array(1536).fill(0);
  }
}

// 主处理函数
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, error: "仅支持POST" });
    }

    // formidable v2 正确创建实例（new IncomingForm()）
    const form = new IncomingForm({
      uploadDir: path.join("/tmp"), // Vercel 原生可写目录
      keepExtensions: true,
      maxFileSize: 4 * 1024 * 1024 // 4MB限制
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
      return res.status(400).json({ success: false, error: "未选择PDF文件" });
    }

    // 读取文件（v2中files.file是对象，不是数组）
    const fileBuffer = await fs.promises.readFile(pdfFile.filepath);
    const fileName = pdfFile.originalFilename || `file_${Date.now()}.pdf`;

    // 核心逻辑
    const text = await extractPdfText(fileBuffer);
    const autoTags = await aiClassifyText(text);
    const embedding = await getTextEmbedding(text);

    // // 写入Supabase
    // if (supabase) {
    //   await supabase.from("files").insert({
    //     file_name: fileName,
    //     tags: autoTags.join(","),
    //     text_content: text.slice(0, 1000)
    //   }).catch(err => console.error("Supabase写入失败：", err));
    // }
    
    // 写入Supabase（正确语法）
    if (supabase) {
      try {
        const { error } = await supabase.from("files").insert({
          file_name: fileName,
          tags: autoTags.join(","),
          text_content: text.slice(0, 1000)
        });
        // 单独判断error
        if (error) {
          console.error("Supabase写入失败：", error.message);
        }
      } catch (err) {
        // 捕获网络等异常
        console.error("Supabase请求异常：", err.message);
      }
    }

    // 写入Pinecone（同样修复catch语法，可选）
    if (pinecone && process.env.PINECONE_INDEX_NAME) {
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
      file_name: fileName
    });

  } catch (error) {
    // 全量异常捕获
    console.error("上传接口异常：", error);
    return res.status(500).json({
      success: false,
      error: error.message || "上传失败"
    });
  }
}
