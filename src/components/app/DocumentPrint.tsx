import { useEffect } from "react";
export function DocumentPrint({ id }: { id: string }) {
  useEffect(() => {
    if (sessionStorage.getItem("print-document") !== id) return;
    sessionStorage.removeItem("print-document");
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [id]);
  return null;
}