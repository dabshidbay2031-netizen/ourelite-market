// Re-mounts on every route change, giving each page an entrance transition.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-anim">{children}</div>;
}
