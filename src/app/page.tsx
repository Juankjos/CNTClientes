import { redirect } from 'next/navigation';
import { apiPath } from '@/lib/api-path';

export default function RootPage() {
  redirect(apiPath('/login'));
}
