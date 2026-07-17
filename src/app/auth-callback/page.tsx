"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function AuthCallback() {
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // 監聽 Supabase 自動處理 URL query code 並成功登入的事件
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || session) {
        router.replace("/");
      }
    });

    // 檢查是否有授權錯誤（例如被 Supabase 拒絕）
    if (window.location.hash.includes("error") || window.location.search.includes("error")) {
       setErrorMsg("登入失敗：" + (window.location.hash || window.location.search));
    } else {
       // 如果沒有錯誤，且等待 3 秒後都沒有觸發 SIGNED_IN，手動檢查一次
       setTimeout(() => {
          supabase.auth.getSession().then(({ data }) => {
             if (data.session) router.replace("/");
             else setErrorMsg("登入憑證驗證逾時，請手動返回首頁重試。");
          });
       }, 3000);
    }

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#edf3f7] px-4 text-center">
      <p className="text-slate-500">{errorMsg || "登入憑證驗證中…"}</p>
      {errorMsg && (
        <button 
          onClick={() => router.replace("/")}
          className="mt-4 rounded-xl bg-teal-600 px-4 py-2 text-white"
        >
          返回首頁
        </button>
      )}
    </div>
  );
}
