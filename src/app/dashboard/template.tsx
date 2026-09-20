// Next.js bu template'i her gezinmede yeniden mount eder → sayfa içeriği
// her geçişte kayarak/solarak girer (sidebar sabit kalır).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-enter">{children}</div>;
}
