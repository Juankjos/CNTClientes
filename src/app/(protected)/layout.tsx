import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.user) {
    redirect('/CNTClientes/login');
  }

  return (
    <div className="min-h-screen bg-cnt-dark flex flex-col">
      <Navbar user={session.user} />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        {children}
      </main>
      <Footer />
    </div>
  );
}
