// src/app/(protected)/peticiones/nueva/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiPath } from '@/lib/api-path';
import Swal from 'sweetalert2';
import DatePicker, { registerLocale } from 'react-datepicker';
import { es } from 'date-fns/locale/es';

registerLocale('es', es);

type AddressOption = {
  slot: 1 | 2 | 3;
  label: string;
  value: string;
};

export default function NuevaPeticionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const pagoId = Number(searchParams.get('pago_id'));
  const catalogoId = Number(searchParams.get('catalogo_id'));

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  const [motivo, setMotivo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [usarDomicilio, setUsarDomicilio] = useState(false);
  const [domicilioSlot, setDomicilioSlot] = useState<string>('');
  const [fechaDeseada, setFechaDeseada] = useState<Date | null>(null);

  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [hasPeticion, setHasPeticion] = useState(false);
  const [catalogoCategoria, setCatalogoCategoria] = useState('');

  const [usaRangoFechas, setUsaRangoFechas] = useState(false);
  const [rangoDias, setRangoDias] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [profileRes, pagoRes] = await Promise.all([
          fetch(apiPath('/api/users/profile')),
          fetch(apiPath(`/api/payments/status?pago_id=${pagoId}`)),
        ]);

        const profileData = await profileRes.json().catch(() => ({}));
        const pagoData = await pagoRes.json().catch(() => ({}));

        setProfile(profileData);
        setPaymentStatus(pagoData.estatus ?? null);
        setHasPeticion(Boolean(pagoData.tiene_peticion));
        setCatalogoCategoria(normalizeCategoria(pagoData.categoria));
        setUsaRangoFechas(toBooleanDb(pagoData.usa_rango_fechas));
        setRangoDias(
          pagoData.rango_dias === null || pagoData.rango_dias === undefined
            ? null
            : Number(pagoData.rango_dias)
        );

        if (pagoData.estatus !== 'pagado') {
          router.replace('/peticiones/referencia');
          return;
        }

        if (Number(pagoData.catalogo_id) !== catalogoId) {
          router.replace('/formularios');
          return;
        }

        if (pagoData.tiene_peticion) {
          router.replace(`/formularios/${pagoId}`);
          return;
        }

        setLoading(false);
      } catch {
        setLoading(false);
      }
    }

    if (!Number.isInteger(pagoId) || pagoId <= 0 || !Number.isInteger(catalogoId) || catalogoId <= 0) {
      router.replace('/formularios');
      return;
    }

    load();
  }, [pagoId, catalogoId, router]);

  function normalizeCategoria(value: unknown) {
    return String(value ?? '').trim().toLowerCase();
  }

  function toBooleanDb(value: unknown) {
    return value === true || value === 1 || value === '1';
  }

  const domicilios = useMemo<AddressOption[]>(() => {
    if (!profile) return [];

    return [1, 2, 3]
      .map((slot) => ({
        slot: slot as 1 | 2 | 3,
        label: `Domicilio ${slot}`,
        value: profile[`domicilio_${slot}`],
      }))
      .filter((d) => Boolean(d.value));
  }, [profile]);

  const isEspecialConRango =
    normalizeCategoria(catalogoCategoria) === 'especial' &&
    usaRangoFechas &&
    Number(rangoDias) > 0;

  const fechaFinCalculada =
    isEspecialConRango && fechaDeseada
      ? addDays(fechaDeseada, Number(rangoDias) - 1)
      : null;


  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!motivo.trim()) {
      await Swal.fire('Falta información', 'Debes escribir el motivo.', 'warning');
      return;
    }

    if (!descripcion.trim()) {
      await Swal.fire('Falta información', 'Debes escribir la descripción.', 'warning');
      return;
    }

    if (usarDomicilio && !domicilioSlot) {
      await Swal.fire('Falta información', 'Debes elegir un domicilio.', 'warning');
      return;
    }

    if (!fechaDeseada) {
      await Swal.fire(
        'Falta información',
        isEspecialConRango
          ? 'Debes elegir la fecha inicial del rango.'
          : 'Debes elegir fecha y hora deseada.',
        'warning'
      );
      return;
    }

    if (isEspecialConRango) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const selected = new Date(fechaDeseada);
      selected.setHours(0, 0, 0, 0);

      if (selected.getTime() < today.getTime()) {
        await Swal.fire(
          'Fecha inválida',
          'Debes elegir una fecha inicial de hoy o posterior.',
          'warning'
        );
        return;
      }
    } else if (fechaDeseada.getTime() < Date.now()) {
      await Swal.fire(
        'Fecha inválida',
        'Debes elegir una fecha y hora posterior al momento actual.',
        'warning'
      );
      return;
    }

    const confirm = await Swal.fire({
      title: '¿Deseas enviar el formulario ahora?',
      text: 'No podrás editar los campos nuevamente.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, enviar',
      cancelButtonText: 'No, cancelar',
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#374151',
    });

    if (!confirm.isConfirmed) {
      return;
    }

    try {
      setSending(true);

      const res = await fetch(apiPath('/api/peticiones'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pago_id: pagoId,
          catalogo_id: catalogoId,
          motivo: motivo.trim(),
          descripcion: descripcion.trim(),
          usar_domicilio: usarDomicilio,
          domicilio_slot: usarDomicilio ? Number(domicilioSlot) : null,
          fecha_deseada: isEspecialConRango
            ? toSqlDateOnly(fechaDeseada)
            : toSqlDateTime(fechaDeseada),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        await Swal.fire('Error', data.error ?? 'No se pudo guardar la petición.', 'error');

        if (data.code === 'PETICION_YA_EXISTE') {
          router.replace(`/formularios/${pagoId}`);
        }
        return;
      }

      await Swal.fire(
        'Petición registrada',
        'Tu solicitud fue enviada correctamente.',
        'success'
      );

      router.replace(`/formularios/${pagoId}`);
    } finally {
      setSending(false);
    }
  }

  function pad(value: number) {
    return String(value).padStart(2, '0');
  }

  function toSqlDateTime(date: Date) {
      const yyyy = date.getFullYear();
      const mm = pad(date.getMonth() + 1);
      const dd = pad(date.getDate());
      const hh = pad(date.getHours());
      const mi = pad(date.getMinutes());
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}:00`;
  }

  function formatFechaAmPm(value: Date | null) {
      if (!value) return '';
      return new Intl.DateTimeFormat('es-MX', {
          dateStyle: 'medium',
          timeStyle: 'short',
          hour12: true,
      }).format(value);
  }

  function formatCategoria(value: string) {
    const text = String(value ?? '').trim();

    if (!text) return 'Noticia / Reportaje';

    return text
      .split('/')
      .map((part) => {
        const cleanPart = part.trim().toLowerCase();
        return cleanPart.charAt(0).toUpperCase() + cleanPart.slice(1);
      })
      .join(' / ');
  }

  function toSqlDateOnly(date: Date) {
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());

    return `${yyyy}-${mm}-${dd}`;
  }

  function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function startOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  function isSameDay(a: Date, b: Date) {
    return startOfDay(a).getTime() === startOfDay(b).getTime();
  }

  function isInsideDateRange(day: Date, start: Date, end: Date) {
    const current = startOfDay(day).getTime();
    const rangeStart = startOfDay(start).getTime();
    const rangeEnd = startOfDay(end).getTime();

    return current >= rangeStart && current <= rangeEnd;
  }

  function getRangeDayClassName(day: Date) {
    if (!isEspecialConRango || !fechaDeseada || !fechaFinCalculada) {
      return '';
    }

    if (!isInsideDateRange(day, fechaDeseada, fechaFinCalculada)) {
      return '';
    }

    const isStart = isSameDay(day, fechaDeseada);
    const isEnd = isSameDay(day, fechaFinCalculada);

    if (isStart && isEnd) return 'cnt-special-range-single';
    if (isStart) return 'cnt-special-range-start';
    if (isEnd) return 'cnt-special-range-end';

    return 'cnt-special-range-middle';
  }

  function formatFechaSolo(value: Date | null) {
    if (!value) return '';

    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
    }).format(value);
  }

  const categoriaLabel = formatCategoria(catalogoCategoria);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 bg-cnt-surface rounded w-1/3" />
        <div className="h-80 bg-cnt-surface rounded-xl" />
      </div>
    );
  }

  if (paymentStatus !== 'pagado' || hasPeticion) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <p className="text-white font-mono text-xs tracking-widest uppercase mb-1">Formulario</p>
        <h1 className="font-display text-3xl text-white">Nueva petición</h1>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-cnt-surface border border-cnt-border rounded-xl p-6 space-y-5"
      >
        <div>
          <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
            Escribe brevemente el motivo o la razón para tu {categoriaLabel}
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red resize-none"
            placeholder="Motivo"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
            Escribe una breve descripción de lo que quieres transmitirnos
          </label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={5}
            className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red resize-none"
            placeholder="Descripción"
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-4 mb-3">
            <label className="text-xs text-gray-400 uppercase tracking-widest">
              ¿Elegir una de tus ubicaciones? (Si eliges no, esta información no se solicitará y se asumirá que la actividad no requiere una ubicación específica)
            </label>

            <button
              type="button"
              onClick={() => {
                const next = !usarDomicilio;
                setUsarDomicilio(next);
                if (!next) setDomicilioSlot('');
              }}
              className={`cursor-pointer px-3 py-2 rounded-lg text-sm border transition-colors ${
                usarDomicilio
                  ? 'bg-cnt-red border-cnt-red text-white'
                  : 'bg-cnt-dark border-cnt-border text-gray-300'
              }`}
            >
              {usarDomicilio ? 'Sí' : 'No'}
            </button>
          </div>

          {usarDomicilio && (
            <select
              value={domicilioSlot}
              onChange={(e) => setDomicilioSlot(e.target.value)}
              className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
            >
              <option value="">Selecciona un domicilio</option>
              {domicilios.map((dom) => (
                <option key={dom.slot} value={dom.slot}>
                  {dom.label}
                </option>
              ))}
            </select>
          )}

          {usarDomicilio && domicilioSlot && (
            <p className="mt-3 text-sm text-gray-400">
              {domicilios.find((d) => String(d.slot) === domicilioSlot)?.value}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
            {isEspecialConRango ? 'Elegir fechas deseadas' : 'Elegir fecha y hora deseada'}

            <span className="block normal-case tracking-normal text-gray-500 mt-1">
              {isEspecialConRango
                ? `Selecciona la fecha inicial. Este especial cubrirá ${rangoDias} día${Number(rangoDias) === 1 ? '' : 's'}.`
                : 'La hora seleccionada se mostrará en formato AM/PM.'}
            </span>
          </label>

          <DatePicker
            id="fecha_deseada"
            selected={fechaDeseada}
            onChange={(date: Date | null) => {
              if (!date) {
                setFechaDeseada(null);
                return;
              }

              if (isEspecialConRango) {
                const onlyDate = new Date(date);
                onlyDate.setHours(0, 0, 0, 0);
                setFechaDeseada(onlyDate);
                return;
              }

              setFechaDeseada(date);
            }}
            showTimeSelect={!isEspecialConRango}
            locale="es"
            minDate={new Date()}
            filterTime={
              isEspecialConRango
                ? undefined
                : (time: Date) => time.getTime() >= Date.now()
            }
            timeIntervals={30}
            timeCaption="Hora"
            dateFormat={isEspecialConRango ? 'dd/MM/yyyy' : 'dd/MM/yyyy h:mm aa'}
            placeholderText={
              isEspecialConRango
                ? 'Selecciona fecha inicial'
                : 'Selecciona fecha y hora'
            }
            dayClassName={isEspecialConRango ? getRangeDayClassName : undefined}
            calendarClassName="cnt-datepicker-calendar"
            popperClassName="cnt-datepicker-popper"
            wrapperClassName="w-full"
            className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red cursor-pointer"
          />

          {fechaDeseada && (
            <div className="mt-3 rounded-lg border border-cnt-border bg-cnt-dark px-4 py-3">
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">
                {isEspecialConRango ? 'Rango seleccionado' : 'Fecha seleccionada'}
              </p>

              {isEspecialConRango ? (
                <div className="space-y-1">
                  <p className="text-white">
                    Inicio:{' '}
                    <span className="font-semibold">
                      {formatFechaSolo(fechaDeseada)}
                    </span>
                  </p>

                  <p className="text-white">
                    Fin:{' '}
                    <span className="font-semibold">
                      {formatFechaSolo(fechaFinCalculada)}
                    </span>
                  </p>

                  <p className="text-xs text-gray-500">
                    Se usarán {rangoDias} día{Number(rangoDias) === 1 ? '' : 's'} consecutivo
                    {Number(rangoDias) === 1 ? '' : 's'} contando desde la fecha inicial.
                  </p>
                </div>
              ) : (
                <p className="text-lg font-semibold text-white">
                  {formatFechaAmPm(fechaDeseada)}
                </p>
              )}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={sending}
          className="cursor-pointer mt-2 w-full bg-cnt-red border border-cnt-border hover:bg-red-700 disabled:bg-red-900 text-white py-3 rounded-lg text-sm font-semibold transition-all"
        >
          {sending ? 'Enviando...' : 'Enviar petición'}
        </button>
      </form>
    </div>
  );
}