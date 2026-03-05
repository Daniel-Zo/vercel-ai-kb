"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// 初始化Supabase（非空断言确保类型正确）
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// 核心修复：兼容处理标签格式（数组/字符串/null都能正常显示）
const formatTags = (tags) => {
  // 情况1：是数组 → 直接join
  if (Array.isArray(tags)) {
    return tags.join(", ");
  }
  // 情况2：是Supabase数组格式的字符串（如"{其他}"）→ 解析后join
  else if (typeof tags === "string" && tags.startsWith("{") && tags.endsWith("}")) {
    return tags.slice(1, -1).split(",").map(tag => tag.trim()).join(", ");
  }
  // 情况3：是普通字符串 → 直接返回
  else if (typeof tags === "string") {
    return tags;
  }
  // 情况4：null/undefined → 返回"未分类"
  else {
    return "未分类";
  }
};

export default function Home() {
  // 状态管理
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [currentFileName, setCurrentFileName] = useState("");

  // 加载已上传文件列表
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
      alert("加载文件失败，请检查网络");
    }
  };

  // 上传PDF并触发AI分类
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
        // 修复1：使用formatTags处理auto_tags
        alert(`上传成功！AI自动标签：${formatTags(data.auto_tags)}`);
        loadFiles(); // 刷新文件列表
      } else {
        alert(`上传失败：${data.error || "未知错误"}`);
      }
    } catch (error) {
      console.error("上传失败：", error);
      alert("上传失败，请检查API配置");
    } finally {
      setUploading(false);
      setFile(null); // 清空文件选择
    }
  };

  // 保存调整后的标签
  const saveTags = async () => {
    if (!currentFileName || selectedTags.length === 0) {
      alert("请选择标签后保存！");
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
        loadFiles();
      } else {
        alert("保存失败：" + data.error);
      }
    } catch (error) {
      console.error("保存标签失败：", error);
      alert("保存失败，请检查网络");
    }
  };

  // 页面加载时初始化文件列表
  useEffect(() => {
    loadFiles();
  }, []);

  // 页面UI（修复2：使用formatTags处理文件列表的tags）
  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px" }}>
      <h1 style={{ fontSize: "28px", textAlign: "center", color: "#2563eb", margin: "20px 0" }}>
        私有AI知识库 - PDF资讯分类
      </h1>

      {/* 上传区域 */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "20px", marginBottom: "20px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "16px" }}>上传PDF资讯文件</h2>
        <input
          type="file"
          accept=".pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ display: "block", marginBottom: "16px", padding: "8px", width: "100%" }}
        />
        <button
          onClick={handleUpload}
          disabled={uploading || !file}
          style={{
            padding: "10px 20px",
            backgroundColor: uploading ? "#94a3b8" : "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: uploading ? "not-allowed" : "pointer",
          }}
        >
          {uploading ? "上传中..." : "上传并自动分类"}
        </button>
      </div>

      {/* 文件管理区域 */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "20px" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "16px" }}>已上传文件管理</h2>
        {files.length === 0 ? (
          <p style={{ color: "#64748b", textAlign: "center", padding: "20px 0" }}>暂无上传的PDF文件</p>
        ) : (
          files.map((f) => (
            <div
              key={f.file_name}
              style={{ border: "1px solid #e5e7eb", borderRadius: "6px", padding: "16px", marginBottom: "16px" }}
            >
              <h3 style={{ fontSize: "18px", marginBottom: "8px" }}>{f.file_name}</h3>
              <p style={{ color: "#64748b", marginBottom: "12px" }}>
                {/* 修复2：使用formatTags处理文件的tags */}
                当前标签：{formatTags(f.tags)}
              </p>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", marginBottom: "8px" }}>调整分类标签：</label>
                <select
                  multiple
                  value={selectedTags}
                  onChange={(e) => {
                    setCurrentFileName(f.file_name);
                    setSelectedTags(Array.from(e.target.selectedOptions).map((o) => o.value));
                  }}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
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
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#16a34a",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
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
