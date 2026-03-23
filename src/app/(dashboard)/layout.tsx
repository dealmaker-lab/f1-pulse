import Sidebar from "@/components/layout/sidebar";
import ChatPanel from "@/components/chat/chat-panel";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Sidebar />
      <main className="lg:ml-[220px] min-h-screen">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 py-4 pt-14 lg:pt-6">
          {children}
        </div>
      </main>
      <ChatPanel />
    </>
  );
}
