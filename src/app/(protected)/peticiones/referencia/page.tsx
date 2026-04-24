'use client';

import { useRouter } from 'next/navigation';

export default function ReferenciaPage() {
  const router = useRouter();

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-cnt-surface border border-cnt-border rounded-xl p-6 text-center">
        <h1 className="font-display text-3xl text-white mb-4">
          ¡Gracias por tu referencia!
        </h1>

        <p className="text-gray-300 leading-relaxed mb-6">
          Podrás ver el estatus de tu pago y en cuanto sea aprobado, deberás realizar
          un formulario que nos ayudará a atender tu solicitud.
        </p>

        <button
          type="button"
          onClick={() => router.push('/formularios')}
          className="cursor-pointer bg-cnt-red hover:bg-red-700 text-white px-5 py-3 rounded-lg text-sm font-semibold transition-all"
        >
          Ir a ventana &quot;Formularios&quot;
        </button>
      </div>
    </div>
  );
}