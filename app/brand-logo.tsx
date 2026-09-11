export default function BrandLogo({ size = 30, zoom = 1.18, className = "" }: { size?: number; zoom?: number; className?: string }) {
  return <span className={"brand-mark " + className} style={{ width: size, height: size }}><img src="/logo.png" alt="" width={size} height={size} className="brand-logo" style={{ transform: "scale(" + zoom + ")" }} /></span>;
}
