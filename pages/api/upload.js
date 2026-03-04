import { extractPdfText, aiClassifyText, getTextEmbedding } from "../../utils";
import { Pinecone } from "@pinecone-database/pinecone";
import { createClient } from "@supabase/supabase-js";
import formidable from "formidable";
import fs from "fs";

// 禁用Next.js默认的body解析（处理文件上传）
export const config = {
  api: {
    bodyParser: false,
  },
};

// 初始化客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});
const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);

export default async function handler(req, res) {
  // 仅允许POST请求
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "仅支持POST请求" });
  }

  // 解析表单数据（包含PDF文件）
  const form = new formidable.IncomingForm();
  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(500).json({ success: false, error: "文件解析失败：" + err.message });
    }

    try {
      // 获取上传的PDF文件
      const pdfFile = files.file[0];
      if (!pdfFile) {
        return res.status(400).json({ success: false, error: "未选择PDF文件" });
      }

      // 1. 读取文件内容并提取文本
      const fileBuffer = fs.readFileSync(pdfFile.filepath);
      const text = await extractPdfText({
        buffer: fileBuffer,
        name: pdfFile.originalFilename || `file_${Date.now()}.pdf`,
      });

      // 2. AI自动分类
      const autoTags = await aiClassifyText(text);

      // 3. 获取文本向量（用于Pinecone存储）
      const embedding = await getTextEmbedding(text);

      // 4. 存储到Supabase
      const fileName = pdfFile.originalFilename || `file_${Date.now()}.pdf`;
      const { error: supabaseError } = await supabase.from("files").insert({
        file_name: fileName,
        tags: autoTags,
        text_content: text.slice(0, 1000), // 仅存储前1000字符，避免超限
      });
      if (supabaseError) throw supabaseError;

      // 5. 存储向量到Pinecone
      await index.upsert([
        {
          id: fileName,
          values: embedding,
          metadata: { tags: autoTags, file_name: fileName },
        },
      ]);

      // 返回成功结果
      return res.status(200).json({
        success: true,
        auto_tags: autoTags,
        file_name: fileName,
      });
    } catch (error) {
      console.error("上传API错误：", error);
      return res.status(500).json({
        success: false,
        error: error.message || "PDF上传/分类失败",
      });
    }
  });
}
