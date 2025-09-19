import React from "react";

export default function ProofImages({ requestId, files = ["01.jpg","02.jpg","03.jpg","04.jpg","05.jpg"] }) {
  if (!requestId) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      {files.map((f) => {
        // ÖNEMLİ: Başında TEK / var → /uploads/... (çift // YOK)
        const src = `/uploads/apply/${encodeURIComponent(requestId)}/${f}`;
        return (
          <img
            key={f}
            src={src}
            alt={f}
            loading="lazy"
            decoding="async"
            onError={(e) => { e.currentTarget.style.display = "none"; }} // yoksa gizle
            className="w-full h-28 object-cover rounded"
          />
        );
      })}
    </div>
  );
}
