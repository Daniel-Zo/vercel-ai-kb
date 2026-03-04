import { createClient } from "@supabase/supabase-js";

// 初始化Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function handler(req, res) {
  try {
    // 获取文件列表（GET请求）
    if (req.method === "GET") {
      const { data, error } = await supabase.from("files").select("*");
      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    // 保存标签（POST请求）
    else if (req.method === "POST") {
      const { fileName, tags } = req.body;
      if (!fileName || !tags) {
        return res.status(400).json({ success: false, error: "文件名/标签不能为空" });
      }

      const { error } = await supabase
        .from("files")
        .update({ tags })
        .eq("file_name", fileName);
      if (error) throw error;

      return res.status(200).json({ success: true });
    }

    // 不支持的请求方法
    else {
      return res.status(405).json({ success: false, error: "仅支持GET/POST请求" });
    }
  } catch (error) {
    console.error("文件API错误：", error);
    return res.status(500).json({
      success: false,
      error: error.message || "操作失败",
    });
  }
}
