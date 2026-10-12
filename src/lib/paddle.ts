const clientToken = import.meta.env["VITE_PAYMENTS_CLIENT_TOKEN"] as string | undefined;

declare global {
  interface Window {
    Paddle: any;
  }
}

/** The preview pays in test mode, the published site in live mode (from the token prefix). */
export function getPaddleEnvironment(): "sandbox" | "live" {
  return clientToken?.startsWith("test_") ? "sandbox" : "live";
}

let ready: Promise<void> | null = null;

export function initializePaddle(): Promise<void> {
  if (ready) return ready;
  if (!clientToken) return Promise.reject(new Error("الدفع بالبطاقة غير متاح حالياً."));
  ready = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.onload = () => {
      window.Paddle.Environment.set(getPaddleEnvironment() === "sandbox" ? "sandbox" : "production");
      window.Paddle.Initialize({ token: clientToken });
      resolve();
    };
    script.onerror = () => {
      ready = null;
      reject(new Error("تعذّر تحميل صفحة الدفع."));
    };
    document.head.appendChild(script);
  });
  return ready;
}
