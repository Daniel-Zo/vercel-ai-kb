"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// 仅初始化Supabase（前端无需Pinecone）
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function AIKBPage() {
  // 状态管理
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<any[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [currentFileName, setCurrentFileName] = useState("");

  // 加载已上传的文件列表（调用服务端API）
  const loadFiles = async () => {
    try {
      const response = await fetch("/api/files", { method: "GET" });
      const data = await response.json();
      if (data.success) {
        setFiles(data.data);
      } else {
        alert("加载文件失败：" + data.error);
      }
    } catch (error) {
      console.error("加载文件失败：", error);
      alert("加载文件失败，请检查网络或API配置");
    }
  };

  // 上传PDF文件并触发AI分类
  const handleUpload = async () => {
    if (!file) {
      alert("请先选择PDF文件！");
      return;
    }
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        alert(`上传成功！AI自动标签：${data.auto_tags.join(", ")}`);
        loadFiles(); // 重新加载文件列表
      } else {
        alert(`上传失败：${data.error || "未知错误"}`);
      }
    } catch (error) {
      console.error("上传请求失败：", error);
      alert("上传失败，请检查网络或API配置");
    } finally {
      setUploading(false);
      setFile(null); // 清空文件选择
    }
  };

  // 保存人工调整后的标签（调用服务端API）
  const saveTags = async () => {
    if (!currentFileName || selectedTags.length === 0) {
      alert("请选择标签后再保存！");
      return;
    }

    try {
      const response = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: currentFileName,
          tags: selectedTags,
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert("标签保存成功！");
        loadFiles(); // 重新加载文件列表
      } else {
        alert("保存标签失败：" + data.error);
      }
    } catch (error) {
      console.error("保存标签失败：", error);
      alert("保存标签失败，请检查网络或API配置");
    }
  };

  // 页面加载时初始化文件列表
  useEffect(() => {
    loadFiles();
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8 text-center text-blue-600">
        私有AI知识库 - 资讯分类
      </h1>

      {/* PDF上传区域 */}
      <div className="mb-10 p-6 border rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4">上传PDF资讯文件</h2>
        <input
          type="file"
          accept=".pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block mb-4 p-2 border rounded w-full"
        />
        <button
          onClick={handleUpload}
          disabled={uploading || !file}
          className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
        >
          {uploading ? "上传中..." : "上传并自动分类"}
        </button>
      </div>

      {/* 已上传文件列表 */}
      <div className="p-6 border rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4">已上传文件管理</h2>
        {files.length === 0 ? (
          <p className="text-gray-500 text-center py-4">暂无上传的PDF文件</p>
        ) : (
          files.map((f) => (
            <div
              key={f.file_name}
              className="mb-4 p-4 border rounded-lg hover:shadow-md"
            >
              <h3 className="font-medium text-lg">{f.file_name}</h3>
              <p className="text-sm text-gray-600 mb-3">
                当前标签：{f.tags?.join(", ") || "未分类"}
              </p>

              {/* 标签调整区域 */}
              <div className="mb-3">
                <label className="block mb-2 text-sm font-medium">
                  调整分类标签：
                </label>
                <select
                  multiple
                  value={selectedTags}
                  onChange={(e) => {
                    setCurrentFileName(f.file_name);
                    setSelectedTags(
                      Array.from(e.target.selectedOptions).map(
                        (o) => o.value
                      )
                    );
                  }}
                  className="border rounded p-2 w-full"
                  size={5}
                >
                  <option value="金融">金融</option>
                  <option value="医疗">医疗</option>
                  <option value="科技">科技</option>
                  <option value="教育">教育</option>
                  <option value="政策">政策</option>
                  <option value="市场">市场</option>
                  <option value="事件">事件</option>
                  <option value="财报">财报</option>
                  <option value="其他">其他</option>
                </select>
              </div>

              <button
                onClick={saveTags}
                className="px-4 py-1 bg-green-500 text-white rounded hover:bg-green-600"
              >
                保存调整后的标签
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}