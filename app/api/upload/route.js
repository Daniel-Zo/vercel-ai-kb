import { createClient } from "@supabase/supabase-js";
import { Pinecone } from "@pinecone-database/pinecone";
import { extractPdfText, aiClassifyText, getTextEmbedding } from "../../../utils";

// 初始化Supabase和Pinecone
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});
const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);

export async function POST(request) {
  try {
    // 1. 解析FormData
    const formData = await request.formData();
    const file = formData.get("file");
    
    if (!file || file.type !== "application/pdf") {
      return Response.json({ error: "请上传PDF文件" }, { status: 400 });
    }

    // 2. 解析PDF文本
    const text = await extractPdfText(file);
    if (!text) {
      return Response.json({ error: "PDF解析失败，无文本内容" }, { status: 500 });
    }

    // 3. AI自动分类
    const autoTags = await aiClassifyText(text);

    // 4. 上传PDF到Supabase存储
    const fileName = file.name;
    const fileBuffer = await file.arrayBuffer();
    await supabase.storage.from("pdf-files").upload(fileName, fileBuffer);
    const fileUrl = supabase.storage.from("pdf-files").getPublicUrl(fileName).data.publicUrl;

    // 5. 获取文本向量
    const embedding = await getTextEmbedding(text);
    if (!embedding.length) {
      return Response.json({ error: "文本向量化失败" }, { status: 500 });
    }

    // 6. 存入Pinecone向量库
    await index.upsert([
      {
        id: fileName,
        values: embedding,
        metadata: {
          file_name: fileName,
          file_url: fileUrl,
          tags: autoTags,
          text: text.slice(0, 2000), // 存储文本摘要
        },
      },
    ]);

    return Response.json({
      success: true,
      file_name: fileName,
      auto_tags: autoTags,
    });
  } catch (error) {
    console.error("上传失败：", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}