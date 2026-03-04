import { Pinecone } from "@pinecone-database/pinecone";

// 初始化Pinecone（服务端环境，可正常使用fs模块）
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});
const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);

// 获取所有已上传的文件列表
export async function GET() {
  try {
    const res = await index.query({
      vector: new Array(1536).fill(0),
      topK: 100,
      includeMetadata: true,
    });
    const fileList = res.matches.map((m) => m.metadata || {});
    return Response.json({ success: true, data: fileList });
  } catch (error) {
    console.error("获取文件列表失败：", error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// 更新文件标签
export async function POST(request) {
  try {
    const { fileName, tags } = await request.json();
    await index.upsert([
      {
        id: fileName,
        metadata: { tags },
      },
    ]);
    return Response.json({ success: true });
  } catch (error) {
    console.error("更新标签失败：", error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}