// Google Analytics integration
// Replace GA_MEASUREMENT_ID with your actual GA4 measurement ID

const GA_MEASUREMENT_ID = process.env.REACT_APP_GA_MEASUREMENT_ID || '';

export function initGA(): void {
  if (!GA_MEASUREMENT_ID) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  (window as any).dataLayer = (window as any).dataLayer || [];
  function gtag(...args: any[]) {
    (window as any).dataLayer.push(args);
  }
  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID);
}

export function trackPageView(path: string): void {
  if (!GA_MEASUREMENT_ID || !(window as any).gtag) return;
  (window as any).gtag('config', GA_MEASUREMENT_ID, {
    page_path: path,
  });
}
