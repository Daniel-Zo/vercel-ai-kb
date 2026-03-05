// pages/api/upload.js - 极简稳定版（无AI依赖）
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { IncomingForm } from "formidable";

// 解决ES模块__dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 仅初始化Supabase
let supabase;
try {
  supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  );
} catch (err) {
  console.error("Supabase初始化失败：", err);
}

// 禁用默认body解析
export const config = {
  api: { bodyParser: false }
};

// 主处理函数（仅处理PDF上传和Supabase写入）
export default async function handler(req, res) {
  // 确保所有异常都返回合法JSON
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: "仅支持POST请求"
      });
    }

    // formidable v2 正确实例化
    const form = new IncomingForm({
      uploadDir: "/tmp",
      keepExtensions: true,
      maxFileSize: 4 * 1024 * 1024 // 4MB限制
    });

    // 解析表单数据
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    // 检查PDF文件
    const pdfFile = files.file;
    if (!pdfFile) {
      return res.status(400).json({
        success: false,
        error: "请选择PDF文件上传"
      });
    }

    // 构造文件信息（固定标签为"其他"）
    const fileName = pdfFile.originalFilename || `file_${Date.now()}.pdf`;
    const defaultTags = ["其他"]; // 固定标签，无需AI

    // 替换原Supabase写入代码段
    if (supabase) {
      // 正确语法：传入数组（适配text[]类型）
      const { error: supabaseError } = await supabase.from("files").insert({
        file_name: fileName,
        tags: defaultTags, // 直接传数组["其他"]，而非字符串"其他"
        text_content: "PDF文件已上传（未提取文本）"
      });
      if (supabaseError) {
        console.error("Supabase写入失败：", supabaseError.message);
      }
    }

    // 返回成功响应（无AI，固定标签）
    return res.status(200).json({
      success: true,
      auto_tags: defaultTags,
      file_name: fileName,
      message: "PDF上传成功（使用默认标签）"
    });

  } catch (error) {
    // 捕获所有异常，返回标准JSON
    console.error("上传接口异常：", error);
    return res.status(500).json({
      success: false,
      error: error.message || "PDF上传失败"
    });
  }
}
