// src/app/(protected)/admin/page.tsx
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiPath } from '@/lib/api-path';
import Swal from 'sweetalert2';
import DatePicker, { registerLocale } from 'react-datepicker';
import { es } from 'date-fns/locale/es';

registerLocale('es', es);

const NIVEL_STYLE: Record<string, string> = {
  debug: 'bg-gray-800 text-gray-400',
  info: 'bg-blue-900/50 text-blue-300',
  warning: 'bg-yellow-900/50 text-yellow-300',
  error: 'bg-red-950 text-cnt-red',
};

const PETICION_STATUS_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
};

const PETICION_STATUS_STYLE: Record<string, string> = {
  pendiente: 'bg-yellow-900/50 text-yellow-300 border-yellow-800',
  aceptada: 'bg-green-900/50 text-green-300 border-green-800',
  rechazada: 'bg-red-950 text-red-300 border-cnt-red',
};

type ReviewForm = {
  motivo: string;
  descripcion: string;
  usar_domicilio: boolean;
  domicilio_slot: string;
  fecha_deseada: Date | null;
  comentario_admin: string;
  estatus: 'pendiente' | 'aceptada' | 'rechazada';
};

const emptyReviewForm: ReviewForm = {
  motivo: '',
  descripcion: '',
  usar_domicilio: false,
  domicilio_slot: '',
  fecha_deseada: null,
  comentario_admin: '',
  estatus: 'pendiente',
};

type UploadedPeticionFile = {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'document' | 'video' | 'compressed';
  relativePath: string;
  url: string;
};

function isUploadedPeticionFile(value: any): value is UploadedPeticionFile {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.originalName === 'string' &&
    typeof value.storedName === 'string' &&
    typeof value.mimeType === 'string' &&
    typeof value.size === 'number' &&
    typeof value.url === 'string'
  );
}

function getArchivosPeticion(peticion: any): UploadedPeticionFile[] {
  const archivos = peticion?.archivos_subidos;

  if (!Array.isArray(archivos)) return [];

  return archivos.filter(isUploadedPeticionFile);
}

function formatBytes(bytes: number) {
  const KB = 1024;
  const MB = 1024 * KB;
  const GB = 1024 * MB;

  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(2)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(2)} KB`;

  return `${bytes} B`;
}

function iconForArchivo(kind: UploadedPeticionFile['kind']) {
  if (kind === 'image') return '🖼️';
  if (kind === 'video') return '🎬';
  if (kind === 'document') return '📄';
  if (kind === 'compressed') return '🗜️';

  return '📎';
}

function canPreviewInline(archivo: UploadedPeticionFile) {
  const mime = String(archivo.mimeType ?? '').toLowerCase();
  const name = String(archivo.originalName ?? '').toLowerCase();

  return (
    mime.startsWith('image/') ||
    mime.startsWith('video/') ||
    mime === 'application/pdf' ||
    name.endsWith('.pdf') ||
    mime.startsWith('text/') ||
    name.endsWith('.txt') ||
    name.endsWith('.csv')
  );
}

function archivoUrl(archivo: UploadedPeticionFile) {
  return apiPath(archivo.url);
}

function archivoDownloadUrl(archivo: UploadedPeticionFile) {
  return `${apiPath(archivo.url)}?download=1`;
}

function toBooleanDb(value: unknown) {
  return value === true || value === 1 || value === '1';
}

function toDateOnlyDisplay(value: unknown) {
  if (!value) return '—';

  const text = String(value).trim();
  const dateOnly = text.length >= 10 ? text.slice(0, 10) : '';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return '—';

  const [year, month, day] = dateOnly.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
  }).format(date);
}

function formatHoraDb(value: unknown) {
  const text = String(value ?? '').trim();

  const match = text.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (!match) return '';

  const [, hh, mm] = match;

  const date = new Date();
  date.setHours(Number(hh), Number(mm), 0, 0);

  return new Intl.DateTimeFormat('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function formatFechaPeticion(dateValue: unknown, horaValue?: unknown, usaHora?: unknown) {
  const fecha = toDateOnlyDisplay(dateValue);
  const hora = toBooleanDb(usaHora) ? formatHoraDb(horaValue) : '';

  if (fecha === '—') return '—';
  if (!hora) return fecha;

  return `${fecha} · ${hora}`;
}

function getRangoDiasPeticion(peticion: any) {
  const value = peticion?.rango_dias ?? peticion?.catalogo_rango_dias ?? null;
  const numberValue = Number(value);

  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
}

function getFechasOmitidasPeticion(peticion: any): Array<{ fecha: string; motivos: string[] }> {
  const value = peticion?.fechas_omitidas;

  if (!Array.isArray(value)) return [];

  return value.filter((item) => {
    return (
      item &&
      typeof item === 'object' &&
      typeof item.fecha === 'string' &&
      Array.isArray(item.motivos)
    );
  });
}

type ToggleSwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

function ToggleSwitch({ checked, onChange, disabled = false }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500/40 ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${
        checked
          ? 'border-[#E34234] bg-[#E34234] hover:border-[#c9362a] hover:bg-[#c9362a]'
          : 'border-cnt-border bg-cnt-surface hover:border-gray-500'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const adminQuery = searchParams.toString();
  const autoOpenedPeticionRef = useRef<string | null>(null);

  const [tab, setTab] = useState<'users' | 'logs' | 'pagos' | 'peticiones'>('peticiones');

  // --- Users state ---
  const [users, setUsers] = useState<any[]>([]);
  const [userPage, setUserPage] = useState(1);
  const [userTotal, setUserTotal] = useState(0);
  const [userQ, setUserQ] = useState('');
  const [userLoading, setUserLoading] = useState(false);
  const [userMsg, setUserMsg] = useState('');

  // --- Logs state ---
  const [logs, setLogs] = useState<any[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const [logNivel, setLogNivel] = useState('');
  const [logQ, setLogQ] = useState('');
  const [logLoading, setLogLoading] = useState(false);
  const [logMsg, setLogMsg] = useState('');

  // --- Pagos admin state ---
  const [pagos, setPagos] = useState<any[]>([]);
  const [pagosPage, setPagosPage] = useState(1);
  const [pagosTotal, setPagosTotal] = useState(0);
  const [pagosQ, setPagosQ] = useState('');

  // --- Peticiones admin state ---
  const [peticiones, setPeticiones] = useState<any[]>([]);
  const [peticionesPage, setPeticionesPage] = useState(1);
  const [peticionesTotal, setPeticionesTotal] = useState(0);
  const [peticionesStatus, setPeticionesStatus] = useState('');
  const [peticionesQ, setPeticionesQ] = useState('');
  const [peticionesLoading, setPeticionesLoading] = useState(false);
  const [peticionMsg, setPeticionMsg] = useState('');

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewEditing, setReviewEditing] = useState(false);
  const [reviewPeticion, setReviewPeticion] = useState<any>(null);
  const [pendingNotificationPeticionId, setPendingNotificationPeticionId] = useState<number | null>(null);
  const [reviewHistorial, setReviewHistorial] = useState<any[]>([]);
  const [reviewDomicilios, setReviewDomicilios] = useState<any[]>([]);
  const [reviewForm, setReviewForm] = useState<ReviewForm>(emptyReviewForm);
  const [quickCommentEditing, setQuickCommentEditing] = useState(false);
  const [quickCommentText, setQuickCommentText] = useState('');
  const [quickCommentSaving, setQuickCommentSaving] = useState(false);
  const [sendingReporteros, setSendingReporteros] = useState(false);

  const [paymentsEnabled, setPaymentsEnabled] = useState(true);
  const [paymentsSettingLoading, setPaymentsSettingLoading] = useState(false);

  // --- Create user state ---
  const emptyCreateUserForm = {
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    rol: 'cliente' as 'admin' | 'cliente',
    nombre: '',
    apellidos: '',
    telefono: '',
    empresa: '',
  };

  type EditUserForm = {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
    rol: 'admin' | 'cliente';
    nombre: string;
    apellidos: string;
    telefono: string;
    empresa: string;
  };

  const emptyEditUserForm: EditUserForm = {
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    rol: 'cliente',
    nombre: '',
    apellidos: '',
    telefono: '',
    empresa: '',
  };

  const [showCreateUser, setShowCreateUser] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserMsg, setCreateUserMsg] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [createUserForm, setCreateUserForm] = useState(emptyCreateUserForm);
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [savingEditUser, setSavingEditUser] = useState(false);
  const [editUserForm, setEditUserForm] = useState<EditUserForm>(emptyEditUserForm);

  const fetchUsers = useCallback(async () => {
    try {
      setUserLoading(true);
      setUserMsg('');

      const params = new URLSearchParams({ page: String(userPage) });
      if (userQ.trim()) params.set('q', userQ.trim());

      const res = await fetch(apiPath(`/api/admin/users?${params.toString()}`));
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
      }

      setUsers(data.users ?? []);
      setUserTotal(data.pagination?.total ?? 0);
    } catch (error) {
      setUsers([]);
      setUserTotal(0);
      setUserMsg(error instanceof Error ? error.message : 'No se pudieron cargar los usuarios');
    } finally {
      setUserLoading(false);
    }
  }, [userPage, userQ]);

  async function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (createUserForm.password !== createUserForm.confirmPassword) {
      setCreateUserMsg({
        type: 'err',
        text: 'La contraseña y la confirmación no coinciden.',
      });

      return;
    }

    if (createUserForm.password.length < 8) {
      setCreateUserMsg({
        type: 'err',
        text: 'La contraseña debe tener al menos 8 caracteres.',
      });

      return;
    }

    try {
      setCreatingUser(true);
      setCreateUserMsg(null);

      const res = await fetch(apiPath('/api/admin/users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createUserForm),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
      }

      setCreateUserMsg({
        type: 'ok',
        text: `Usuario creado correctamente (ID ${data.id})`,
      });

      setCreateUserForm(emptyCreateUserForm);
      setShowCreateUser(false);

      if (userPage !== 1) {
        setUserPage(1);
      } else {
        await fetchUsers();
      }
    } catch (error) {
      setCreateUserMsg({
        type: 'err',
        text: error instanceof Error ? error.message : 'No se pudo crear el usuario',
      });
    } finally {
      setCreatingUser(false);
    }
  }

  function openEditUserModal(user: any) {
    setEditingUser(user);

    setEditUserForm({
      username: String(user.username ?? ''),
      email: String(user.email ?? ''),
      password: '',
      confirmPassword: '',
      rol: user.rol === 'admin' ? 'admin' : 'cliente',
      nombre: String(user.nombre ?? ''),
      apellidos: String(user.apellidos ?? ''),
      telefono: String(user.telefono ?? ''),
      empresa: String(user.empresa ?? ''),
    });

    setEditUserOpen(true);
  }

  async function cancelEditUser() {
    const result = await Swal.fire({
      title: '¿Cancelar edición?',
      text: 'Los cambios no guardados se perderán.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, cancelar',
      cancelButtonText: 'Seguir editando',
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#374151',
      background: '#111827',
      color: '#ffffff',
    });

    if (!result.isConfirmed) return;

    setEditUserOpen(false);
    setEditingUser(null);
    setEditUserForm(emptyEditUserForm);

    await Swal.fire({
      title: 'Edición cancelada',
      text: 'No se realizaron cambios en el usuario.',
      icon: 'info',
      confirmButtonColor: '#dc2626',
      background: '#111827',
      color: '#ffffff',
    });
  }

  async function saveEditUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!editingUser) return;

    if (editUserForm.password || editUserForm.confirmPassword) {
      if (editUserForm.password !== editUserForm.confirmPassword) {
        await Swal.fire({
          title: 'Contraseñas diferentes',
          text: 'La contraseña y la confirmación no coinciden.',
          icon: 'error',
          confirmButtonColor: '#dc2626',
          background: '#111827',
          color: '#ffffff',
        });

        return;
      }

      if (editUserForm.password.length < 8) {
        await Swal.fire({
          title: 'Contraseña inválida',
          text: 'La contraseña debe tener al menos 8 caracteres.',
          icon: 'error',
          confirmButtonColor: '#dc2626',
          background: '#111827',
          color: '#ffffff',
        });

        return;
      }
    }

    const confirm = await Swal.fire({
      title: '¿Guardar cambios?',
      text: `Se actualizará el usuario ${editUserForm.username}.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#374151',
      background: '#111827',
      color: '#ffffff',
    });

    if (!confirm.isConfirmed) {
      await Swal.fire({
        title: 'Guardado cancelado',
        text: 'No se aplicaron cambios.',
        icon: 'info',
        confirmButtonColor: '#dc2626',
        background: '#111827',
        color: '#ffffff',
      });

      return;
    }

    try {
      setSavingEditUser(true);

      const payload: any = {
        username: editUserForm.username,
        email: editUserForm.email,
        rol: editUserForm.rol,
        nombre: editUserForm.nombre,
        apellidos: editUserForm.apellidos,
        telefono: editUserForm.telefono,
        empresa: editUserForm.empresa,
      };

      if (editUserForm.password.trim()) {
        payload.password = editUserForm.password;
      }

      const res = await fetch(apiPath(`/api/admin/users/${editingUser.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || data?.detail || `HTTP ${res.status}`);
      }

      await fetchUsers();

      setEditUserOpen(false);
      setEditingUser(null);
      setEditUserForm(emptyEditUserForm);

      await Swal.fire({
        title: 'Usuario actualizado',
        text: 'Los cambios se guardaron correctamente.',
        icon: 'success',
        confirmButtonColor: '#dc2626',
        background: '#111827',
        color: '#ffffff',
      });
    } catch (error) {
      await Swal.fire({
        title: 'Error',
        text: error instanceof Error ? error.message : 'No se pudo actualizar el usuario.',
        icon: 'error',
        confirmButtonColor: '#dc2626',
        background: '#111827',
        color: '#ffffff',
      });
    } finally {
      setSavingEditUser(false);
    }
  }

  const fetchLogs = useCallback(async () => {
    try {
      setLogLoading(true);
      setLogMsg('');

      const params = new URLSearchParams({ page: String(logPage) });

      if (logNivel) params.set('nivel', logNivel);
      if (logQ.trim()) params.set('q', logQ.trim());

      const res = await fetch(apiPath(`/api/admin/logs?${params.toString()}`));
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
      }

      setLogs(data.logs ?? []);
      setLogTotal(data.pagination?.total ?? 0);
    } catch (error) {
      setLogs([]);
      setLogTotal(0);
      setLogMsg(error instanceof Error ? error.message : 'No se pudieron cargar los logs');
    } finally {
      setLogLoading(false);
    }
  }, [logPage, logNivel, logQ]);

  const fetchPagos = useCallback(async () => {
    const params = new URLSearchParams({ page: String(pagosPage) });

    if (pagosQ.trim()) params.set('q', pagosQ.trim());

    const res = await fetch(apiPath(`/api/admin/payments?${params.toString()}`));
    const data = await res.json().catch(() => ({}));

    setPagos(data.pagos ?? []);
    setPagosTotal(data.pagination?.total ?? 0);
  }, [pagosPage, pagosQ]);

  const fetchPeticiones = useCallback(async () => {
    try {
      setPeticionesLoading(true);
      setPeticionMsg('');

      const params = new URLSearchParams({ page: String(peticionesPage) });

      if (peticionesStatus) params.set('estatus', peticionesStatus);
      if (peticionesQ.trim()) params.set('q', peticionesQ.trim());

      const res = await fetch(apiPath(`/api/admin/peticiones?${params.toString()}`));
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      setPeticiones(data.peticiones ?? []);
      setPeticionesTotal(data.pagination?.total ?? 0);
    } catch (error) {
      setPeticiones([]);
      setPeticionesTotal(0);
      setPeticionMsg(error instanceof Error ? error.message : 'No se pudieron cargar las peticiones');
    } finally {
      setPeticionesLoading(false);
    }
  }, [peticionesPage, peticionesStatus, peticionesQ]);

  const getNombreCompleto = (u: any) => {
    const nombre = String(u?.nombre ?? '').trim();
    const apellidos = String(u?.apellidos ?? '').trim();
    return [nombre, apellidos].filter(Boolean).join(' ') || '—';
  };

  const getWhatsAppHref = (telefono: unknown) => {
    const raw = String(telefono ?? '').trim();
    const digits = raw.replace(/\D/g, '');

    if (!digits) return null;

    const normalized = digits.length === 10 ? `52${digits}` : digits;

    return `https://wa.me/${normalized}`;
  };

  const fetchPaymentsSetting = useCallback(async () => {
    try {
      const res = await fetch(apiPath('/api/admin/settings/payments'));
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      setPaymentsEnabled(Boolean(data.payments_enabled));
    } catch (error) {
      console.error('[fetchPaymentsSetting]', error);
    }
  }, []);

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

  function parseFechaDeseada(value: unknown) {
    const raw = String(value ?? '').trim();

    if (!raw) return null;

    const match = raw.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/
    );

    if (match) {
      const [, yyyy, mm, dd, hh = '0', mi = '0', ss = '0'] = match;

      return new Date(
        Number(yyyy),
        Number(mm) - 1,
        Number(dd),
        Number(hh),
        Number(mi),
        Number(ss)
      );
    }

    const date = new Date(raw);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatFechaAmPm(value: Date | null) {
    if (!value) return '';

    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: true,
    }).format(value);
  }

  function peticionEnviadaReporteros(peticion: any) {
    return Boolean(peticion?.enviada_reporteros_at || peticion?.noticia_id);
  }

  function parseDateOnlyLocal(value: unknown) {
    const text = String(value ?? '').trim();
    const dateOnly = text.length >= 10 ? text.slice(0, 10) : '';

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;

    const [year, month, day] = dateOnly.split('-').map(Number);

    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  function parseHoraDbParts(value: unknown) {
    const text = String(value ?? '').trim();
    const match = text.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);

    if (!match) return null;

    return {
      hours: Number(match[1]),
      minutes: Number(match[2]),
      seconds: Number(match[3] ?? 0),
    };
  }

  function buildFechaDeseadaForPicker(
    fechaValue: unknown,
    horaValue?: unknown,
    usaHora?: unknown
  ) {
    const date = parseDateOnlyLocal(fechaValue);

    if (!date) return null;

    if (toBooleanDb(usaHora)) {
      const hora = parseHoraDbParts(horaValue);

      if (hora) {
        date.setHours(hora.hours, hora.minutes, hora.seconds, 0);
      }
    }

    return date;
  }

  function toSqlDate(date: Date) {
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());

    return `${yyyy}-${mm}-${dd}`;
  }

  function toSqlTime(date: Date) {
    const hh = pad(date.getHours());
    const mi = pad(date.getMinutes());

    return `${hh}:${mi}:00`;
  }

  async function openPeticionReview(id: number) {
    try {
      setReviewOpen(true);
      setReviewLoading(true);
      setReviewEditing(false);

      const res = await fetch(apiPath(`/api/admin/peticiones/${id}`));
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      setReviewPeticion(data.peticion);
      setReviewHistorial(data.historial ?? []);
      setReviewDomicilios(data.domiciliosDisponibles ?? []);
      setQuickCommentEditing(false);
      setQuickCommentText(data.peticion?.comentario_admin ?? '');

      setReviewForm({
        motivo: data.peticion?.motivo ?? '',
        descripcion: data.peticion?.descripcion ?? '',
        usar_domicilio: Boolean(data.peticion?.usar_domicilio),
        domicilio_slot: data.peticion?.domicilio_slot ? String(data.peticion.domicilio_slot) : '',
        fecha_deseada: buildFechaDeseadaForPicker(
          data.peticion?.fecha_deseada,
          data.peticion?.hora_cita,
          data.peticion?.usa_hora_cita
        ),
        comentario_admin: data.peticion?.comentario_admin ?? '',
        estatus: (data.peticion?.estatus ?? 'pendiente') as ReviewForm['estatus'],
      });
    } catch (error) {
      setPeticionMsg(error instanceof Error ? error.message : 'No se pudo abrir la petición');
      setReviewOpen(false);
    } finally {
      setReviewLoading(false);
    }
  }

  async function changePeticionStatus(id: number, estatus: 'aceptada' | 'rechazada') {
    const isAceptada = estatus === 'aceptada';

    const confirm = await Swal.fire({
      title: isAceptada ? '¿Aceptar esta petición?' : '¿Rechazar esta petición?',
      text: isAceptada
        ? 'La petición pasará al estado de aceptada.'
        : 'La petición pasará al estado de rechazada.',
      icon: isAceptada ? 'question' : 'warning',
      showCancelButton: true,
      confirmButtonText: isAceptada ? 'Sí, aceptar' : 'Sí, rechazar',
      cancelButtonText: 'No, cancelar',
      confirmButtonColor: isAceptada ? '#16a34a' : '#dc2626',
      cancelButtonColor: '#374151',
      background: '#111827',
      color: '#ffffff',
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await fetch(apiPath(`/api/admin/peticiones/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estatus }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        await Swal.fire({
          title: 'Error',
          text: data.error ?? 'No se pudo actualizar la petición.',
          icon: 'error',
          confirmButtonColor: '#dc2626',
          background: '#111827',
          color: '#ffffff',
        });

        setPeticionMsg(data.error ?? 'No se pudo actualizar la petición');
        return;
      }

      await Swal.fire({
        title: isAceptada ? 'Petición aceptada' : 'Petición rechazada',
        text: 'El estado de la petición fue actualizado correctamente.',
        icon: 'success',
        confirmButtonColor: '#dc2626',
        background: '#111827',
        color: '#ffffff',
      });

      await fetchPeticiones();

      if (reviewPeticion?.id === id) {
        await openPeticionReview(id);
      }
    } catch {
      await Swal.fire({
        title: 'Error',
        text: 'Ocurrió un problema al actualizar la petición.',
        icon: 'error',
        confirmButtonColor: '#dc2626',
        background: '#111827',
        color: '#ffffff',
      });

      setPeticionMsg('Ocurrió un problema al actualizar la petición');
    }
  }

  async function enviarAReporteros(id: number) {
    const confirm = await Swal.fire({
      title: '¿Enviar contenido a reporteros?',
      text: 'Si aceptas, se enviará a la lista de tareas para reporteros.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, enviar',
      cancelButtonText: 'No, cancelar',
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#374151',
      background: '#111827',
      color: '#ffffff',
    });

    if (!confirm.isConfirmed) return;

    try {
      setSendingReporteros(true);

      const res = await fetch(apiPath(`/api/admin/peticiones/${id}/enviar-reporteros`), {
        method: 'POST',
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        await Swal.fire({
          title: 'Error',
          text: data.error ?? 'No se pudo enviar el contenido a reporteros.',
          icon: 'error',
          confirmButtonColor: '#dc2626',
          background: '#111827',
          color: '#ffffff',
        });

        return;
      }

      await Swal.fire({
        title: 'Tarea enviada',
        text: 'El contenido fue enviado a reporteros correctamente.',
        icon: 'success',
        confirmButtonColor: '#dc2626',
        background: '#111827',
        color: '#ffffff',
      });

      await fetchPeticiones();
      await openPeticionReview(id);
    } catch {
      await Swal.fire({
        title: 'Error',
        text: 'Ocurrió un problema al enviar el contenido a reporteros.',
        icon: 'error',
        confirmButtonColor: '#dc2626',
        background: '#111827',
        color: '#ffffff',
      });
    } finally {
      setSendingReporteros(false);
    }
  }

  async function saveReviewPeticion() {
    if (!reviewPeticion) return;

    setReviewSaving(true);

    if (!reviewForm.fecha_deseada) {
      setPeticionMsg('Debes elegir fecha y hora deseada');
      setReviewSaving(false);
      return;
    }

    const res = await fetch(apiPath(`/api/admin/peticiones/${reviewPeticion.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        motivo: reviewForm.motivo,
        descripcion: reviewForm.descripcion,
        usar_domicilio: reviewForm.usar_domicilio,
        domicilio_slot: reviewForm.usar_domicilio ? Number(reviewForm.domicilio_slot) : null,
        fecha_deseada: toSqlDate(reviewForm.fecha_deseada),
        hora_cita: reviewPeticion.usa_hora_cita ? toSqlTime(reviewForm.fecha_deseada) : null,
        comentario_admin: reviewForm.comentario_admin,
        estatus: reviewForm.estatus,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setReviewSaving(false);

    if (!res.ok) {
      setPeticionMsg(data.error ?? 'No se pudo guardar la petición');
      return;
    }

    await fetchPeticiones();
    await openPeticionReview(reviewPeticion.id);
    setReviewEditing(false);
    }

  async function saveQuickAdminComment() {
    if (!reviewPeticion) return;

    try {
      setQuickCommentSaving(true);
      setPeticionMsg('');

      const res = await fetch(apiPath(`/api/admin/peticiones/${reviewPeticion.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comentario_admin: quickCommentText,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error ?? 'No se pudo guardar el comentario');
      }

      await fetchPeticiones();
      await openPeticionReview(reviewPeticion.id);

      setQuickCommentEditing(false);
    } catch (error) {
      setPeticionMsg(
        error instanceof Error ? error.message : 'No se pudo guardar el comentario'
      );
    } finally {
      setQuickCommentSaving(false);
    }
  }

  async function handleTogglePayments(checked: boolean) {
    const confirm = await Swal.fire({
      title: checked ? '¿Habilitar pagos?' : '¿Deshabilitar pagos?',
      text: checked
        ? 'Los clientes podrán generar pagos nuevamente.'
        : 'Los clientes no podrán generar pagos mientras esta opción esté desactivada.',
      icon: checked ? 'question' : 'warning',
      showCancelButton: true,
      confirmButtonText: checked ? 'Sí, habilitar' : 'Sí, deshabilitar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: checked ? '#16a34a' : '#dc2626',
      cancelButtonColor: '#374151',
      background: '#111827',
      color: '#ffffff',
    });

    if (!confirm.isConfirmed) return;

    try {
      setPaymentsSettingLoading(true);

      const previousValue = paymentsEnabled;
      setPaymentsEnabled(checked);

      const res = await fetch(apiPath('/api/admin/settings/payments'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payments_enabled: checked }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setPaymentsEnabled(previousValue);
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      await Swal.fire({
        title: checked ? 'Pagos habilitados' : 'Pagos deshabilitados',
        text: checked
          ? 'Los clientes ya pueden generar pagos.'
          : 'Los clientes verán un aviso cuando intenten pagar.',
        icon: 'success',
        confirmButtonColor: '#dc2626',
        background: '#111827',
        color: '#ffffff',
      });
    } catch (error) {
      await Swal.fire({
        title: 'Error',
        text: error instanceof Error ? error.message : 'No se pudo actualizar la configuración.',
        icon: 'error',
        confirmButtonColor: '#dc2626',
        background: '#111827',
        color: '#ffffff',
      });
    } finally {
      setPaymentsSettingLoading(false);
    }
  }

  useEffect(() => {
    if (tab === 'users') fetchUsers();
  }, [tab, fetchUsers]);

  useEffect(() => {
    if (tab === 'logs') fetchLogs();
  }, [tab, fetchLogs]);

  useEffect(() => {
    if (tab === 'pagos') fetchPagos();
  }, [tab, fetchPagos]);

  useEffect(() => {
    if (tab === 'peticiones') fetchPeticiones();
  }, [tab, fetchPeticiones]);

  useEffect(() => {
    fetchPaymentsSetting();
  }, [fetchPaymentsSetting]);

  useEffect(() => {
    const params = new URLSearchParams(adminQuery);

    const tabParam = params.get('tab');
    const rawPeticionId = params.get('peticionId');

    if (tabParam !== 'peticiones' || !rawPeticionId) {
      autoOpenedPeticionRef.current = null;
      return;
    }

    const peticionId = Number(rawPeticionId);

    if (!Number.isInteger(peticionId) || peticionId <= 0) {
      autoOpenedPeticionRef.current = null;
      router.replace('/admin', { scroll: false });
      return;
    }

    const key = `peticion:${peticionId}`;

    if (autoOpenedPeticionRef.current === key) return;

    autoOpenedPeticionRef.current = key;

    setTab('peticiones');
    setPeticionesStatus('');
    setPeticionesQ('');
    setPeticionesPage(1);
    setPendingNotificationPeticionId(peticionId);

    void openPeticionReview(peticionId);
  }, [adminQuery, router]);

  useEffect(() => {
    if (!pendingNotificationPeticionId) return;
    if (!reviewOpen) return;
    if (reviewLoading) return;
    if (!reviewPeticion?.id) return;

    if (Number(reviewPeticion.id) !== pendingNotificationPeticionId) return;

    setPendingNotificationPeticionId(null);
    router.replace('/admin', { scroll: false });
  }, [
    pendingNotificationPeticionId,
    reviewOpen,
    reviewLoading,
    reviewPeticion?.id,
    router,
  ]);

  useEffect(() => {
    function handleOpenAdminPeticion(event: Event) {
      const customEvent = event as CustomEvent<{ peticionId?: number }>;
      const peticionId = Number(customEvent.detail?.peticionId);

      if (!Number.isInteger(peticionId) || peticionId <= 0) return;

      setTab('peticiones');
      setPeticionesStatus('');
      setPeticionesQ('');
      setPeticionesPage(1);
      setPendingNotificationPeticionId(peticionId);

      void openPeticionReview(peticionId);
    }

    window.addEventListener('cnt:open-admin-peticion', handleOpenAdminPeticion);

    return () => {
      window.removeEventListener('cnt:open-admin-peticion', handleOpenAdminPeticion);
    };
  }, []);

  async function toggleUser(id: number, activo: number) {
    const nextActivo = activo === 1 ? 0 : 1;
    const activating = nextActivo === 1;

    const confirm = await Swal.fire({
      title: activating ? '¿Activar cliente?' : '¿Desactivar cliente?',
      text: activating
        ? 'El cliente podrá acceder nuevamente.'
        : 'El cliente no podrá acceder mientras esté desactivado.',
      icon: activating ? 'question' : 'warning',
      showCancelButton: true,
      confirmButtonText: activating ? 'Sí, activar' : 'Sí, desactivar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: activating ? '#16a34a' : '#dc2626',
      cancelButtonColor: '#374151',
      background: '#111827',
      color: '#ffffff',
    });

    if (!confirm.isConfirmed) {
      await Swal.fire({
        title: 'Acción cancelada',
        text: 'No se modificó el estado del cliente.',
        icon: 'info',
        confirmButtonColor: '#dc2626',
        background: '#111827',
        color: '#ffffff',
      });

      return;
    }

    try {
      const res = await fetch(apiPath(`/api/admin/users/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: nextActivo }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || data?.detail || `HTTP ${res.status}`);
      }

      await fetchUsers();

      await Swal.fire({
        title: activating ? 'Cliente activado' : 'Cliente desactivado',
        text: activating
          ? 'El cliente fue activado correctamente.'
          : 'El cliente fue desactivado correctamente.',
        icon: 'success',
        confirmButtonColor: '#dc2626',
        background: '#111827',
        color: '#ffffff',
      });
    } catch (error) {
      await Swal.fire({
        title: 'Error',
        text: error instanceof Error ? error.message : 'No se pudo actualizar el cliente.',
        icon: 'error',
        confirmButtonColor: '#dc2626',
        background: '#111827',
        color: '#ffffff',
      });
    }
  }

  async function desbloquearUser(id: number) {
    await fetch(apiPath(`/api/admin/users/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ desbloquear: true }),
    });
    fetchUsers();
  }

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-white font-mono text-xs tracking-widest uppercase mb-1">
            Panel de administración
          </p>
          <h1 className="font-display text-3xl text-white">Administrador CNT</h1>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-cnt-border bg-cnt-surface px-4 py-2">
            <div className="text-right">
              <p className="text-xs text-gray-400 uppercase tracking-widest">
                Pagos del catálogo
              </p>
              <p className={`text-sm font-semibold ${paymentsEnabled ? 'text-green-300' : 'text-red-300'}`}>
                {paymentsEnabled ? 'Habilitados' : 'Deshabilitados'}
              </p>
            </div>

            <ToggleSwitch
              checked={paymentsEnabled}
              disabled={paymentsSettingLoading}
              onChange={handleTogglePayments}
            />
          </div>

          <Link
            href="/admin/statistics"
            className="px-4 py-2 bg-blue-950 border border-cnt-border text-blue-300 hover:text-white rounded-lg text-sm transition-colors"
          >
            Estadísticas
          </Link>

          <Link
            href="/admin/catalog"
            className="px-4 py-2 bg-yellow-900 border border-cnt-border text-yellow-300 hover:text-white rounded-lg text-sm transition-colors"
          >
            Gestionar Catálogo
          </Link>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-cnt-surface border border-cnt-border rounded-lg p-1 w-fit">
        {(['peticiones', 'users', 'pagos', 'logs'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`cursor-pointer px-5 py-2 rounded-md text-sm transition-colors capitalize ${
              tab === t ? 'bg-cnt-dark text-white' : 'text-gray-500 hover:text-white'
            }`}
          >
            {t === 'users'
              ? 'Usuarios'
              : t === 'pagos'
                ? 'Pagos'
                : t === 'peticiones'
                  ? 'Peticiones'
                  : 'Logs'}
          </button>
        ))}
      </div>

      {/* ======================== USUARIOS ======================== */}
      {tab === 'users' && (
        <div>
          <div className="mb-5 space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <input
                value={userQ}
                onChange={(e) => {
                  setUserQ(e.target.value);
                  setUserPage(1);
                }}
                placeholder="Buscar por usuario, nombre, teléfono, email o empresa..."
                className="flex-1 max-w-sm bg-cnt-surface border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (userPage !== 1) {
                      setUserPage(1);
                    } else {
                      fetchUsers();
                    }
                  }
                }}
              />

              {/* <button
                onClick={() => {
                  if (userPage !== 1) {
                    setUserPage(1);
                  } else {
                    fetchUsers();
                  }
                }}
                className="cursor-pointer px-4 py-2 bg-cnt-red hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
              >
                Buscar
              </button> */}

              {userQ && (
                <button
                  type="button"
                  onClick={() => {
                    setUserQ('');
                    setUserPage(1);
                  }}
                  className="cursor-pointer px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 hover:text-white rounded-lg text-sm transition-colors"
                >
                  Limpiar
                </button>
              )}

              <button
                onClick={() => {
                  setShowCreateUser((v) => !v);
                  setCreateUserMsg(null);
                }}
                className="cursor-pointer px-4 py-2 bg-green-950 border border-cnt-border text-green-300 hover:text-white rounded-lg text-sm transition-colors"
              >
                {showCreateUser ? 'Cerrar formulario' : '+ Nuevo usuario'}
              </button>

              <span className="px-3 py-2 text-gray-500 text-sm">{userTotal} usuarios</span>
            </div>

            {userMsg && (
              <div className="rounded-lg border border-cnt-red bg-red-950 px-4 py-3 text-sm text-red-300">
                {userMsg}
              </div>
            )}

            {createUserMsg && (
              <div
                className={`rounded-lg px-4 py-3 text-sm border ${
                  createUserMsg.type === 'ok'
                    ? 'bg-green-950 text-green-300 border-green-800'
                    : 'bg-red-950 text-red-300 border-cnt-red'
                }`}
              >
                {createUserMsg.text}
              </div>
            )}

            {showCreateUser && (
              <form
                onSubmit={handleCreateUser}
                className="rounded-xl border border-cnt-border bg-cnt-surface p-5 space-y-4"
              >
                <div>
                  <p className="text-white text-sm font-semibold mb-1">Crear usuario</p>
                  <p className="text-gray-500 text-xs">
                    Puedes crear cuentas de administrador o cliente.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    value={createUserForm.username}
                    onChange={(e) => setCreateUserForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder="Username"
                    required
                    className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                  />
                  <input
                    value={createUserForm.email}
                    onChange={(e) => setCreateUserForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="Correo electrónico"
                    type="email"
                    required
                    className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    value={createUserForm.password}
                    onChange={(e) =>
                      setCreateUserForm((f) => ({ ...f, password: e.target.value }))
                    }
                    placeholder="Contraseña"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                  />

                  <input
                    value={createUserForm.confirmPassword}
                    onChange={(e) =>
                      setCreateUserForm((f) => ({ ...f, confirmPassword: e.target.value }))
                    }
                    placeholder="Confirmar contraseña"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className={`w-full bg-cnt-dark border text-white rounded-lg px-4 py-3 text-sm focus:outline-none transition-colors ${
                      createUserForm.confirmPassword &&
                      createUserForm.password !== createUserForm.confirmPassword
                        ? 'border-cnt-red focus:border-cnt-red'
                        : 'border-cnt-border focus:border-cnt-red'
                    }`}
                  />

                  <select
                    value={createUserForm.rol}
                    onChange={(e) =>
                      setCreateUserForm((f) => ({
                        ...f,
                        rol: e.target.value as 'admin' | 'cliente',
                      }))
                    }
                    className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                  >
                    <option value="cliente">Cliente</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

                {createUserForm.confirmPassword &&
                  createUserForm.password !== createUserForm.confirmPassword && (
                    <p className="text-xs text-red-300">
                      La contraseña y la confirmación no coinciden.
                    </p>
                  )}

                {createUserForm.rol === 'cliente' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <input
                        value={createUserForm.nombre}
                        onChange={(e) => setCreateUserForm((f) => ({ ...f, nombre: e.target.value }))}
                        placeholder="Nombre"
                        className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                      />
                      <input
                        value={createUserForm.apellidos}
                        onChange={(e) => setCreateUserForm((f) => ({ ...f, apellidos: e.target.value }))}
                        placeholder="Apellidos"
                        className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <input
                        value={createUserForm.telefono}
                        onChange={(e) => setCreateUserForm((f) => ({ ...f, telefono: e.target.value }))}
                        placeholder="Teléfono"
                        className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                      />
                      <input
                        value={createUserForm.empresa}
                        onChange={(e) => setCreateUserForm((f) => ({ ...f, empresa: e.target.value }))}
                        placeholder="Empresa"
                        className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateUser(false);
                      setCreateUserMsg(null);
                      setCreateUserForm(emptyCreateUserForm);
                    }}
                    className="cursor-pointer px-4 py-2 bg-cnt-dark border border-cnt-border text-gray-400 hover:text-white rounded-lg text-sm transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={creatingUser}
                    className="cursor-pointer px-4 py-2 bg-cnt-red hover:bg-red-700 disabled:bg-red-900 text-white rounded-lg text-sm transition-colors"
                  >
                    {creatingUser ? 'Creando...' : 'Crear usuario'}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-cnt-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cnt-border bg-cnt-surface">
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest">Usuario</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest">Nombre completo</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest">Teléfono</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest">Email</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest">Rol</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest">Estado</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cnt-border">
                {userLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="bg-cnt-dark">
                      {[...Array(7)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-cnt-surface rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr className="bg-cnt-dark">
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                      No se encontraron usuarios.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="bg-cnt-dark hover:bg-cnt-surface/50 transition-colors">
                      <td className="px-4 py-3 text-white font-medium">{u.username}</td>

                      <td className="px-4 py-3 text-gray-300">{getNombreCompleto(u)}</td>

                      <td className="px-4 py-3 text-gray-400">
                        {getWhatsAppHref(u.telefono) ? (
                          <a
                            href={getWhatsAppHref(u.telefono)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-300 hover:text-green-200 hover:underline"
                            title="Abrir en WhatsApp"
                          >
                            {u.telefono?.trim()}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="px-4 py-3 text-gray-400">{u.email}</td>

                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                            u.rol === 'admin' ? 'bg-red-950 text-white' : 'bg-cnt-surface text-white'
                          }`}
                        >
                          {u.rol}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        {u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date() ? (
                          <span className="text-cnt-red text-xs">🔒 Bloqueado</span>
                        ) : (
                          <span className={`text-xs ${u.activo ? 'text-green-400' : 'text-gray-600'}`}>
                            {u.activo ? '● Activo' : '○ Inactivo'}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => openEditUserModal(u)}
                            className="cursor-pointer px-2 py-1 bg-blue-950/40 border border-blue-800 text-blue-300 hover:text-white rounded text-xs transition-colors"
                          >
                            Editar
                          </button>

                          <button
                            onClick={() => toggleUser(u.id, u.activo)}
                            className="cursor-pointer px-2 py-1 bg-cnt-surface border border-cnt-border text-gray-400 hover:text-white rounded text-xs transition-colors"
                          >
                            {u.activo ? 'Desactivar' : 'Activar'}
                          </button>

                          {u.bloqueado_hasta && (
                            <button
                              onClick={() => desbloquearUser(u.id)}
                              className="cursor-pointer px-2 py-1 bg-yellow-950/50 border border-yellow-800 text-yellow-300 hover:text-yellow-200 rounded text-xs transition-colors"
                            >
                              Desbloquear
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================== PAGOS ======================== */}
      {tab === 'pagos' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              value={pagosQ}
              onChange={(e) => {
                setPagosQ(e.target.value);
                setPagosPage(1);
              }}
              placeholder="Buscar por referencia, cliente, correo, contenido o método..."
              className="flex-1 max-w-sm bg-cnt-surface border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-cnt-red transition-colors"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (pagosPage !== 1) {
                    setPagosPage(1);
                  } else {
                    fetchPagos();
                  }
                }
              }}
            />

            {/* <button
              type="button"
              onClick={() => {
                if (pagosPage !== 1) {
                  setPagosPage(1);
                } else {
                  fetchPagos();
                }
              }}
              className="cursor-pointer px-4 py-2 bg-cnt-red hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
            >
              Buscar
            </button> */}

            {pagosQ && (
              <button
                type="button"
                onClick={() => {
                  setPagosQ('');
                  setPagosPage(1);
                }}
                className="cursor-pointer px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 hover:text-white rounded-lg text-sm transition-colors"
              >
                Limpiar
              </button>
            )}

            <span className="text-gray-500 text-sm">{pagosTotal} pagos totales</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-cnt-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cnt-border bg-cnt-surface">
                  {['Referencia', 'Cliente', 'Contenido', 'Monto', 'Método', 'Estatus', 'Fecha'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-cnt-border">
                {pagos.length === 0 ? (
                  <tr className="bg-cnt-dark">
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                      No se encontraron pagos.
                    </td>
                  </tr>
                ) : (
                  pagos.map((p: any) => (
                    <tr key={p.id} className="bg-cnt-dark hover:bg-cnt-surface/50 transition-colors">
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.referencia}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{p.nombre ?? p.email}</td>
                      <td className="px-4 py-3 text-white text-xs max-w-32 truncate">{p.titulo}</td>
                      <td className="px-4 py-3 text-white font-medium">${Number(p.monto).toFixed(2)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs capitalize">{p.metodo_pago}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] uppercase ${
                            p.estatus === 'pagado'
                              ? 'bg-green-900/50 text-green-300 border-green-800'
                              : p.estatus === 'pendiente'
                                ? 'bg-yellow-900/50 text-yellow-300 border-yellow-800'
                                : 'bg-gray-800 text-gray-400 border-gray-700'
                          }`}
                        >
                          {p.estatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {new Date(p.created_at).toLocaleDateString('es-MX')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pagosTotal > 10 && (
            <div className="flex justify-center gap-2 mt-4">
              <button
                disabled={pagosPage <= 1}
                onClick={() => setPagosPage((p) => p - 1)}
                className="cursor-pointer px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 rounded-lg text-sm disabled:opacity-40"
              >
                ← Anterior
              </button>
              <button
                disabled={pagosPage * 10 >= pagosTotal}
                onClick={() => setPagosPage((p) => p + 1)}
                className="cursor-pointer px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 rounded-lg text-sm disabled:opacity-40"
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ======================== PETICIONES ======================== */}
      {tab === 'peticiones' && (
        <div>
          <div className="mb-5 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={peticionesQ}
                onChange={(e) => {
                  setPeticionesQ(e.target.value);
                  setPeticionesPage(1);
                }}
                placeholder="Buscar por cliente, contenido, motivo o descripción..."
                className="flex-1 max-w-sm bg-cnt-surface border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (peticionesPage !== 1) {
                      setPeticionesPage(1);
                    } else {
                      fetchPeticiones();
                    }
                  }
                }}
              />

              {/* <button
                type="button"
                onClick={() => {
                  if (peticionesPage !== 1) {
                    setPeticionesPage(1);
                  } else {
                    fetchPeticiones();
                  }
                }}
                className="cursor-pointer px-4 py-2 bg-cnt-red hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
              >
                Buscar
              </button> */}

              {peticionesQ && (
                <button
                  type="button"
                  onClick={() => {
                    setPeticionesQ('');
                    setPeticionesPage(1);
                  }}
                  className="cursor-pointer px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 hover:text-white rounded-lg text-sm transition-colors"
                >
                  Limpiar
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {[
                { value: '', label: 'Todas' },
                { value: 'pendiente', label: 'Pendientes' },
                { value: 'aceptada', label: 'Aceptadas' },
                { value: 'rechazada', label: 'Rechazadas' },
              ].map((item) => (
                <button
                  key={item.value || 'all'}
                  onClick={() => {
                    setPeticionesStatus(item.value);
                    setPeticionesPage(1);
                  }}
                  className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs transition-colors border ${
                    peticionesStatus === item.value
                      ? 'border-cnt-red bg-red-950/30 text-white'
                      : 'border-cnt-border text-gray-500 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}

              <span className="px-3 py-1.5 text-gray-600 text-xs">
                {peticionesTotal} registros
              </span>
            </div>
          </div>

          {peticionMsg && (
            <div className="rounded-lg border border-cnt-red bg-red-950 px-4 py-3 text-sm text-red-300 mb-4">
              {peticionMsg}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-cnt-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cnt-border bg-cnt-surface">
                  {['Cliente', 'Contenido', 'Archivos', 'Estatus', 'Acciones'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-cnt-border">
                {peticionesLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="bg-cnt-dark">
                      {[...Array(5)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-cnt-surface rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : peticiones.length === 0 ? (
                  <tr className="bg-cnt-dark">
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                      No se encontraron peticiones.
                    </td>
                  </tr>
                ) : (
                  peticiones.map((p: any) => (
                    <tr key={p.id} className="bg-cnt-dark hover:bg-cnt-surface/50 transition-colors">
                      <td className="px-4 py-3 text-white">{p.cliente_nombre}</td>
                      <td className="px-4 py-3">
                        <p className="text-white">{p.titulo}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Inicio: {formatFechaPeticion(p.fecha_deseada, p.hora_cita, p.usa_hora_cita)}
                        </p>
                        {p.fecha_fin && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            Fin: {toDateOnlyDisplay(p.fecha_fin)}
                          </p>
                        )}
                        {Number(p.rango_dias) > 0 && (
                          <p className="text-xs text-blue-300 mt-0.5">
                            Rango: {Number(p.rango_dias)} día{Number(p.rango_dias) === 1 ? '' : 's'}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {Number(p.archivos_count ?? 0) > 0 ? (
                          <span className="px-2 py-0.5 rounded border border-blue-800 bg-blue-950/40 text-blue-300 text-[10px] uppercase tracking-wider">
                            {p.archivos_count} archivo{Number(p.archivos_count) === 1 ? '' : 's'}
                          </span>
                        ) : (
                          <span className="text-gray-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`w-fit px-2 py-0.5 rounded border text-[10px] uppercase tracking-wider mb-2 ${
                              PETICION_STATUS_STYLE[p.estatus] ?? 'bg-gray-800 text-gray-400 border-gray-700'
                            }`}
                          >
                            {PETICION_STATUS_LABEL[p.estatus] ?? p.estatus}
                          </span>

                          {peticionEnviadaReporteros(p) && (
                            <span className="w-fit px-2 py-0.5 rounded border border-green-800 bg-green-950/40 text-green-300 text-[10px] uppercase tracking-wider">
                              Enviada a reporteros
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => openPeticionReview(p.id)}
                            className="cursor-pointer px-2 py-1 bg-cnt-surface border border-cnt-border text-gray-300 hover:text-white rounded text-xs transition-colors"
                          >
                            Revisar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {peticionesTotal > 10 && (
            <div className="flex justify-center gap-2 mt-4">
              <button
                disabled={peticionesPage <= 1}
                onClick={() => setPeticionesPage((p) => p - 1)}
                className="cursor-pointer px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 rounded-lg text-sm disabled:opacity-40"
              >
                ← Anterior
              </button>
              <button
                disabled={peticionesPage * 10 >= peticionesTotal}
                onClick={() => setPeticionesPage((p) => p + 1)}
                className="cursor-pointer px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 rounded-lg text-sm disabled:opacity-40"
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ======================== LOGS ======================== */}
      {tab === 'logs' && (
        <div>
          <div className="mb-5 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={logQ}
                onChange={(e) => {
                  setLogQ(e.target.value);
                  setLogPage(1);
                }}
                placeholder="Buscar por usuario, acción, módulo, descripción o IP..."
                className="flex-1 max-w-sm bg-cnt-surface border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (logPage !== 1) {
                      setLogPage(1);
                    } else {
                      fetchLogs();
                    }
                  }
                }}
              />

              {/* <button
                type="button"
                onClick={() => {
                  if (logPage !== 1) {
                    setLogPage(1);
                  } else {
                    fetchLogs();
                  }
                }}
                className="cursor-pointer px-4 py-2 bg-cnt-red hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
              >
                Buscar
              </button> */}

              {logQ && (
                <button
                  type="button"
                  onClick={() => {
                    setLogQ('');
                    setLogPage(1);
                  }}
                  className="cursor-pointer px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 hover:text-white rounded-lg text-sm transition-colors"
                >
                  Limpiar
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {['', 'debug', 'info', 'warning', 'error'].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setLogNivel(n);
                    setLogPage(1);
                  }}
                  className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs transition-colors border ${
                    logNivel === n
                      ? 'border-cnt-red bg-red-950/30 text-white'
                      : 'border-cnt-border text-gray-500 hover:text-white'
                  }`}
                >
                  {n === '' ? 'Todos' : n}
                </button>
              ))}
              <span className="px-3 py-1.5 text-gray-600 text-xs">{logTotal} registros</span>
            </div>
          </div>

          {logMsg && (
            <div className="rounded-lg border border-cnt-red bg-red-950 px-4 py-3 text-sm text-red-300 mb-4">
              {logMsg}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-cnt-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cnt-border bg-cnt-surface">
                  {['Nivel', 'Usuario', 'Acción', 'Módulo', 'Descripción', 'IP', 'Fecha'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-cnt-border font-mono">
                {logLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="bg-cnt-dark">
                      {[...Array(7)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-cnt-surface rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : logs.length === 0 ? (
                  <tr className="bg-cnt-dark">
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                      No se encontraron logs.
                    </td>
                  </tr>
                ) : (
                  logs.map((l: any) => (
                    <tr key={l.id} className="bg-cnt-dark hover:bg-cnt-surface/50 transition-colors">
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase ${NIVEL_STYLE[l.nivel] ?? 'bg-gray-800 text-gray-400'}`}>
                          {l.nivel}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{l.username ?? '—'}</td>
                      <td className="px-4 py-2.5 text-white text-xs">{l.accion}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{l.modulo ?? '—'}</td>
                      <td className="px-4 py-2.5 align-top">
                        <div className="max-h-28 min-w-72 max-w-md overflow-y-auto rounded-md border border-cnt-border bg-cnt-surface/40 px-3 py-2 text-xs text-gray-400 whitespace-pre-wrap break-words leading-relaxed">
                          {l.descripcion ?? '—'}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{l.ip ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">
                        {new Date(l.created_at).toLocaleString('es-MX', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {logTotal > 20 && (
            <div className="flex justify-center gap-2 mt-4">
              <button
                disabled={logPage <= 1}
                onClick={() => setLogPage((p) => p - 1)}
                className="cursor-pointer px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 rounded-lg text-sm disabled:opacity-40"
              >
                ← Anterior
              </button>
              <button
                disabled={logPage * 20 >= logTotal}
                onClick={() => setLogPage((p) => p + 1)}
                className="cursor-pointer px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 rounded-lg text-sm disabled:opacity-40"
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ======================== PETICIONES MODAL ======================== */}
      {reviewOpen && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-cnt-border bg-cnt-dark shadow-2xl">
            <div className="p-6 border-b border-cnt-border flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                  Revisar petición
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-white text-xl font-semibold">
                    {reviewPeticion?.titulo ?? 'Cargando...'}
                  </h2>

                  {reviewPeticion?.id && (
                    <span className="px-2 py-1 rounded-md border border-blue-800 bg-blue-950/40 text-xs uppercase tracking-wider text-blue-300">
                      Petición #{reviewPeticion.id}
                    </span>
                  )}

                  {reviewPeticion?.categoria && (
                    <span className="px-2 py-1 rounded-md border border-cnt-border bg-cnt-surface text-xs uppercase tracking-wider text-gray-300">
                      {reviewPeticion.categoria}
                    </span>
                  )}
                </div>

                <p className="text-gray-500 text-sm mt-1">
                  Cliente: {reviewPeticion?.cliente_nombre || 'Sin nombre'}
                </p>
                <p className="text-gray-500 text-sm mt-1">
                  Teléfono:{' '}
                  {getWhatsAppHref(reviewPeticion?.cliente_telefono) ? (
                    <a
                      href={getWhatsAppHref(reviewPeticion?.cliente_telefono)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-300 hover:text-green-200 hover:underline"
                      title="Abrir en WhatsApp"
                    >
                      {reviewPeticion.cliente_telefono.trim()}
                    </a>
                  ) : (
                    'No tiene'
                  )}
                </p>
                <p className="text-gray-500 text-sm mt-1">
                  Correo:{' '}
                  {reviewPeticion?.cliente_email ? (
                    <a
                      href={`mailto:${reviewPeticion.cliente_email}`}
                      className="text-gray-300 hover:text-white hover:underline"
                    >
                      {reviewPeticion.cliente_email}
                    </a>
                  ) : (
                    'No tiene'
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setReviewOpen(false);
                  setReviewEditing(false);
                  setQuickCommentEditing(false);
                  setQuickCommentText('');
                  setPendingNotificationPeticionId(null);
                  setReviewPeticion(null);
                  setReviewHistorial([]);
                  setReviewDomicilios([]);
                  setReviewForm(emptyReviewForm);
                }}
                className="cursor-pointer px-3 py-2 rounded-lg border border-cnt-border text-gray-300 hover:text-white"
              >
                Cerrar
              </button>
            </div>

            <div className="p-6">
              {reviewLoading ? (
                <div className="space-y-4 animate-pulse">
                  <div className="h-6 rounded bg-cnt-surface w-1/3" />
                  <div className="h-24 rounded bg-cnt-surface" />
                  <div className="h-24 rounded bg-cnt-surface" />
                </div>
              ) : reviewPeticion ? (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`px-2 py-1 rounded border text-xs uppercase tracking-wider ${
                        PETICION_STATUS_STYLE[reviewPeticion.estatus] ?? 'bg-gray-800 text-gray-400 border-gray-700'
                      }`}
                    >
                      {PETICION_STATUS_LABEL[reviewPeticion.estatus] ?? reviewPeticion.estatus}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {!reviewEditing && reviewPeticion.estatus === 'pendiente' && (
                      <>
                        <button
                          type="button"
                          onClick={() => changePeticionStatus(reviewPeticion.id, 'aceptada')}
                          className="cursor-pointer px-4 py-2 rounded-lg border border-green-800 text-green-300 hover:bg-green-900/30 text-sm"
                        >
                          Aceptar Petición
                        </button>

                        <button
                          type="button"
                          onClick={() => changePeticionStatus(reviewPeticion.id, 'rechazada')}
                          className="cursor-pointer px-4 py-2 rounded-lg border border-cnt-red text-red-300 hover:bg-red-950/30 text-sm"
                        >
                          Rechazar Petición
                        </button>
                      </>
                    )}

                    {!reviewEditing &&
                      reviewPeticion.estatus === 'pendiente' &&
                      !peticionEnviadaReporteros(reviewPeticion) && (
                        <button
                          type="button"
                          onClick={() => setReviewEditing(true)}
                          className="cursor-pointer px-4 py-2 rounded-lg border border-cnt-border text-white hover:border-cnt-red text-sm"
                        >
                          Editar
                        </button>
                    )}

                    {!reviewEditing && reviewPeticion.estatus === 'aceptada' && (
                      peticionEnviadaReporteros(reviewPeticion) ? (
                        <span className="px-4 py-2 rounded-lg border border-green-800 bg-green-950/40 text-green-300 text-sm">
                          Tarea enviada a reporteros✅
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={sendingReporteros}
                          onClick={() => enviarAReporteros(reviewPeticion.id)}
                          className="cursor-pointer px-4 py-2 rounded-lg border border-blue-800 bg-blue-950/40 text-blue-300 hover:text-white hover:bg-blue-900/40 disabled:opacity-60 text-sm"
                        >
                          {sendingReporteros ? 'Enviando...' : 'Enviar a reporteros'}
                        </button>
                      )
                    )}
                  </div>

                  {reviewEditing ? (
                    <div className="space-y-5">
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                          Motivo / Título
                        </label>
                        <textarea
                          value={reviewForm.motivo}
                          onChange={(e) => setReviewForm((f) => ({ ...f, motivo: e.target.value }))}
                          rows={3}
                          className="w-full bg-cnt-surface border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red resize-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                          Descripción
                        </label>
                        <textarea
                          value={reviewForm.descripcion}
                          onChange={(e) => setReviewForm((f) => ({ ...f, descripcion: e.target.value }))}
                          rows={5}
                          className="w-full bg-cnt-surface border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red resize-none"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-4 mb-3">
                          <label className="text-xs text-gray-400 uppercase tracking-widest">
                            ¿Usar domicilio?
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setReviewForm((f) => ({
                                ...f,
                                usar_domicilio: !f.usar_domicilio,
                                domicilio_slot: !f.usar_domicilio ? f.domicilio_slot : '',
                              }))
                            }
                            className={`cursor-pointer px-3 py-2 rounded-lg text-sm border transition-colors ${
                              reviewForm.usar_domicilio
                                ? 'bg-cnt-red border-cnt-red text-white'
                                : 'bg-cnt-surface border-cnt-border text-gray-300'
                            }`}
                          >
                            {reviewForm.usar_domicilio ? 'Sí' : 'No'}
                          </button>
                        </div>

                        {reviewForm.usar_domicilio && (
                          <>
                            <select
                              value={reviewForm.domicilio_slot}
                              onChange={(e) =>
                                setReviewForm((f) => ({ ...f, domicilio_slot: e.target.value }))
                              }
                              className="w-full bg-cnt-surface border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                            >
                              <option value="">Selecciona un domicilio</option>
                              {reviewDomicilios.map((dom: any) => (
                                <option key={dom.slot} value={dom.slot}>
                                  {dom.label}
                                </option>
                              ))}
                            </select>

                            {reviewForm.domicilio_slot && (
                              <p className="mt-3 text-sm text-gray-400">
                                {
                                  reviewDomicilios.find(
                                    (d: any) => String(d.slot) === reviewForm.domicilio_slot
                                  )?.value
                                }
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                            Fecha deseada
                            <span className="block normal-case tracking-normal text-gray-500 mt-1">
                              La hora seleccionada se mostrará en formato AM/PM.
                            </span>
                          </label>
                          <DatePicker
                            id="review_fecha_deseada"
                            selected={reviewForm.fecha_deseada}
                            onChange={(date: Date | null) =>
                              setReviewForm((f) => ({ ...f, fecha_deseada: date }))
                            }
                            showTimeSelect={Boolean(reviewPeticion?.usa_hora_cita)}
                            locale="es"
                            minDate={new Date()}
                            filterTime={(time) => time.getTime() >= Date.now()}
                            timeIntervals={30}
                            timeCaption="Hora"
                            dateFormat={reviewPeticion?.usa_hora_cita ? 'dd/MM/yyyy h:mm aa' : 'dd/MM/yyyy'}
                            placeholderText={reviewPeticion?.usa_hora_cita ? 'Selecciona fecha y hora' : 'Selecciona fecha'}
                            calendarClassName="cnt-datepicker-calendar"
                            popperClassName="cnt-datepicker-popper"
                            wrapperClassName="w-full"
                            className="w-full bg-cnt-surface border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red cursor-pointer"
                          />

                          {reviewForm.fecha_deseada && (
                            <div className="mt-3 rounded-lg border border-cnt-border bg-cnt-surface px-4 py-3">
                              <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">
                                Fecha seleccionada
                              </p>
                              <p className="text-lg font-semibold text-white">
                                {formatFechaAmPm(reviewForm.fecha_deseada)}
                              </p>
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                            Estatus
                          </label>
                          <select
                            value={reviewForm.estatus}
                            onChange={(e) =>
                              setReviewForm((f) => ({
                                ...f,
                                estatus: e.target.value as ReviewForm['estatus'],
                              }))
                            }
                            className="w-full bg-cnt-surface border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                          >
                            <option value="pendiente">Pendiente</option>
                            <option value="aceptada">Aceptada</option>
                            <option value="rechazada">Rechazada</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                          Comentario admin
                          <span className="block normal-case tracking-normal text-gray-500 mt-1">
                            Este comentario será visible para el cliente. Úsalo para dar retroalimentación o solicitar más información.
                          </span>
                        </label>
                        <textarea
                          value={reviewForm.comentario_admin}
                          onChange={(e) =>
                            setReviewForm((f) => ({ ...f, comentario_admin: e.target.value }))
                          }
                          rows={4}
                          className="w-full bg-cnt-surface border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red resize-none"
                        />
                      </div>

                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setReviewEditing(false)}
                          className="cursor-pointer px-4 py-2 rounded-lg border border-cnt-border text-gray-300 hover:text-white"
                        >
                          Cancelar edición
                        </button>

                        <button
                          type="button"
                          disabled={reviewSaving}
                          onClick={saveReviewPeticion}
                          className="cursor-pointer px-4 py-2 rounded-lg border border-cnt-border bg-cnt-red hover:bg-red-700 disabled:bg-red-900 text-white"
                        >
                          {reviewSaving ? 'Guardando...' : 'Guardar'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Motivo / Título</p>
                        <p className="text-white">{reviewPeticion.motivo}</p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                          Descripción
                        </p>
                        <p className="text-white whitespace-pre-wrap">{reviewPeticion.descripcion}</p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Ubicación para la actividad</p>
                        <p className="text-white">
                          {reviewPeticion.usar_domicilio
                            ? reviewPeticion.domicilio_texto
                            : 'Sin ubicación'}
                        </p>
                      </div>

                      <div className="rounded-xl border border-cnt-border bg-cnt-surface p-4">
                        <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">
                          Programación solicitada
                        </p>
                        <div className="space-y-2">
                          <p className="text-sm text-gray-400">
                            Fecha deseada:{' '}
                            <span className="text-white font-medium">
                              {formatFechaPeticion(
                                reviewPeticion.fecha_deseada,
                                reviewPeticion.hora_cita,
                                reviewPeticion.usa_hora_cita
                              )}
                            </span>
                          </p>
                          {reviewPeticion.fecha_fin && (
                            <p className="text-sm text-gray-400">
                              Fecha fin:{' '}
                              <span className="text-white font-medium">
                                {toDateOnlyDisplay(reviewPeticion.fecha_fin)}
                              </span>
                            </p>
                          )}
                          {getRangoDiasPeticion(reviewPeticion) && (
                            <p className="text-sm text-gray-400">
                              Rango:{' '}
                              <span className="text-blue-300 font-medium">
                                {getRangoDiasPeticion(reviewPeticion)} día
                                {getRangoDiasPeticion(reviewPeticion) === 1 ? '' : 's'} aplicable
                                {getRangoDiasPeticion(reviewPeticion) === 1 ? '' : 's'}
                              </span>
                            </p>
                          )}
                          {toBooleanDb(reviewPeticion.usa_hora_cita) && reviewPeticion.hora_cita && (
                            <p className="text-sm text-gray-400">
                              Hora:{' '}
                              <span className="text-purple-300 font-medium">
                                {formatHoraDb(reviewPeticion.hora_cita)}
                              </span>
                            </p>
                          )}
                        </div>
                        {reviewPeticion.fecha_fin && (
                          <div className="mt-4 border-t border-cnt-border pt-4">
                            <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                              Días omitidos
                            </p>
                            {getFechasOmitidasPeticion(reviewPeticion).length === 0 ? (
                              <p className="text-sm text-gray-500">
                                No se omitieron días dentro del rango.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {getFechasOmitidasPeticion(reviewPeticion).map((item) => (
                                  <div
                                    key={item.fecha}
                                    className="rounded-lg border border-yellow-800/60 bg-yellow-950/30 px-3 py-2"
                                  >
                                    <p className="text-sm text-white">
                                      {toDateOnlyDisplay(item.fecha)}
                                    </p>
                                    <p className="text-xs text-yellow-300 mt-0.5">
                                      {item.motivos.join(' | ')}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border border-cnt-border bg-cnt-surface/40 p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-widest">
                              Comentario del administrador
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              Visible para el cliente.
                            </p>
                          </div>

                          {!quickCommentEditing && (
                            <button
                              type="button"
                              onClick={() => {
                                setQuickCommentText(reviewPeticion.comentario_admin ?? '');
                                setQuickCommentEditing(true);
                              }}
                              className="cursor-pointer rounded-lg border border-cnt-border px-3 py-2 text-xs text-gray-300 transition-colors hover:border-cnt-red hover:text-white"
                            >
                              {reviewPeticion.comentario_admin ? 'Editar comentario' : 'Agregar comentario'}
                            </button>
                          )}
                        </div>

                        {quickCommentEditing ? (
                          <div className="space-y-3">
                            <textarea
                              value={quickCommentText}
                              onChange={(e) => setQuickCommentText(e.target.value)}
                              rows={4}
                              placeholder="Escribe un comentario visible para el cliente..."
                              className="w-full resize-none rounded-lg border border-cnt-border bg-cnt-dark px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-cnt-red focus:outline-none"
                            />

                            <div className="flex justify-end gap-3">
                              <button
                                type="button"
                                disabled={quickCommentSaving}
                                onClick={() => {
                                  setQuickCommentEditing(false);
                                  setQuickCommentText(reviewPeticion.comentario_admin ?? '');
                                }}
                                className="cursor-pointer rounded-lg border border-cnt-border px-4 py-2 text-sm text-gray-300 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Cancelar
                              </button>

                              <button
                                type="button"
                                disabled={quickCommentSaving}
                                onClick={saveQuickAdminComment}
                                className="cursor-pointer rounded-lg border border-cnt-red bg-cnt-red px-4 py-2 text-sm text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-900 disabled:opacity-70"
                              >
                                {quickCommentSaving
                                  ? 'Guardando...'
                                  : reviewPeticion.comentario_admin
                                    ? 'Guardar'
                                    : 'Agregar'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-yellow-300 whitespace-pre-wrap">
                            {reviewPeticion.comentario_admin || '—'}
                          </p>
                        )}
                      </div>

                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                          Archivos adjuntos
                        </p>

                        {reviewPeticion.archivos_eliminados_at ? (
                          <div className="rounded-lg border border-yellow-800 bg-yellow-950/30 px-4 py-3">
                            <p className="text-sm text-yellow-300">
                              Los archivos de esta petición ya fueron eliminados por limpieza automática.
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              Eliminados el{' '}
                              {new Date(reviewPeticion.archivos_eliminados_at).toLocaleString('es-MX', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </p>

                            {reviewPeticion.archivos_limpieza_error && (
                              <p className="text-xs text-red-300 mt-2">
                                Error de limpieza: {reviewPeticion.archivos_limpieza_error}
                              </p>
                            )}
                          </div>
                        ) : getArchivosPeticion(reviewPeticion).length === 0 ? (
                          <p className="text-sm text-gray-500">No se adjuntaron archivos.</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {getArchivosPeticion(reviewPeticion).map((archivo) => (
                              <div
                                key={archivo.id}
                                className="rounded-xl border border-cnt-border bg-cnt-surface overflow-hidden"
                              >
                                <div className="p-4 flex items-start gap-3">
                                  <div className="text-3xl shrink-0">
                                    {iconForArchivo(archivo.kind)}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm text-white font-medium truncate">
                                      {archivo.originalName}
                                    </p>

                                    <p className="text-xs text-gray-500 mt-1">
                                      {archivo.kind} · {formatBytes(Number(archivo.size))}
                                    </p>

                                    <p className="text-[10px] text-gray-600 mt-1 truncate">
                                      {archivo.mimeType}
                                    </p>
                                  </div>
                                </div>

                                {canPreviewInline(archivo) && (
                                  <div className="border-t border-cnt-border bg-cnt-dark">
                                    {archivo.mimeType.startsWith('image/') ? (
                                      <a
                                        href={archivoUrl(archivo)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Abrir imagen"
                                      >
                                        <img
                                          src={archivoUrl(archivo)}
                                          alt={archivo.originalName}
                                          className="h-48 w-full object-contain bg-black/40"
                                        />
                                      </a>
                                    ) : archivo.mimeType.startsWith('video/') ? (
                                      <video
                                        controls
                                        preload="metadata"
                                        className="h-48 w-full bg-black"
                                      >
                                        <source src={archivoUrl(archivo)} type={archivo.mimeType} />
                                        Tu navegador no puede reproducir este video.
                                      </video>
                                    ) : (
                                      <iframe
                                        src={archivoUrl(archivo)}
                                        title={archivo.originalName}
                                        className="h-48 w-full bg-white"
                                      />
                                    )}
                                  </div>
                                )}

                                <div className="p-3 border-t border-cnt-border flex flex-wrap gap-2">
                                  <a
                                    href={archivoUrl(archivo)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1.5 rounded-lg border border-cnt-border text-xs text-gray-300 hover:text-white hover:border-cnt-red"
                                  >
                                    Ver
                                  </a>

                                  <a
                                    href={archivoDownloadUrl(archivo)}
                                    className="px-3 py-1.5 rounded-lg border border-cnt-border bg-cnt-blue text-xs text-gray-300 hover:text-white hover:border-cnt-red"
                                  >
                                    Descargar
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-cnt-border pt-6">
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-4">
                      Historial de cambios
                    </p>

                    {reviewHistorial.length === 0 ? (
                      <p className="text-sm text-gray-500">Sin historial.</p>
                    ) : (
                      <div className="space-y-3">
                        {reviewHistorial.map((h: any) => (
                          <div
                            key={h.id}
                            className="rounded-lg border border-cnt-border bg-cnt-surface p-4"
                          >
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className="text-white text-sm font-medium">{h.accion}</span>
                              <span className="text-gray-500 text-xs">
                                {new Date(h.created_at).toLocaleString('es-MX')}
                              </span>
                              {h.admin_username && (
                                <span className="text-gray-500 text-xs">por {h.admin_username}</span>
                              )}
                            </div>

                            {h.campo && (
                              <p className="text-sm text-gray-400 mb-1">
                                Campo: <span className="text-white">{h.campo}</span>
                              </p>
                            )}

                            <p className="text-sm text-gray-500">
                              Anterior: <span className="text-white">{h.valor_anterior ?? '—'}</span>
                            </p>
                            <p className="text-sm text-gray-500">
                              Nuevo: <span className="text-white">{h.valor_nuevo ?? '—'}</span>
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ======================== EDITAR USUARIO MODAL ======================== */}
      {editUserOpen && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-cnt-border bg-cnt-dark shadow-2xl">
            <div className="p-6 border-b border-cnt-border flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                  Editar usuario
                </p>

                <h2 className="text-white text-xl font-semibold">
                  {editingUser?.username ?? 'Usuario'}
                </h2>

                <p className="text-gray-500 text-sm mt-1">
                  Puedes modificar datos de acceso y datos del cliente.
                </p>
              </div>

              <button
                type="button"
                disabled={savingEditUser}
                onClick={cancelEditUser}
                className="cursor-pointer px-3 py-2 rounded-lg border border-cnt-border text-gray-300 hover:text-white disabled:opacity-60"
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={saveEditUser} className="p-6 space-y-5">
              <div>
                <p className="text-white text-sm font-semibold mb-1">
                  Datos de acceso
                </p>
                <p className="text-xs text-gray-500">
                  Deja la contraseña vacía si no deseas cambiarla.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  value={editUserForm.username}
                  onChange={(e) =>
                    setEditUserForm((f) => ({ ...f, username: e.target.value }))
                  }
                  placeholder="Username"
                  required
                  className="w-full bg-cnt-surface border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                />

                <input
                  value={editUserForm.email}
                  onChange={(e) =>
                    setEditUserForm((f) => ({ ...f, email: e.target.value }))
                  }
                  placeholder="Correo electrónico"
                  type="email"
                  required
                  className="w-full bg-cnt-surface border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                  value={editUserForm.password}
                  onChange={(e) =>
                    setEditUserForm((f) => ({ ...f, password: e.target.value }))
                  }
                  placeholder="Nueva contraseña"
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full bg-cnt-surface border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                />

                <input
                  value={editUserForm.confirmPassword}
                  onChange={(e) =>
                    setEditUserForm((f) => ({ ...f, confirmPassword: e.target.value }))
                  }
                  placeholder="Confirmar contraseña"
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  className={`w-full bg-cnt-surface border text-white rounded-lg px-4 py-3 text-sm focus:outline-none transition-colors ${
                    editUserForm.confirmPassword &&
                    editUserForm.password !== editUserForm.confirmPassword
                      ? 'border-cnt-red focus:border-cnt-red'
                      : 'border-cnt-border focus:border-cnt-red'
                  }`}
                />

                <select
                  value={editUserForm.rol}
                  onChange={(e) =>
                    setEditUserForm((f) => ({
                      ...f,
                      rol: e.target.value as 'admin' | 'cliente',
                    }))
                  }
                  className="w-full bg-cnt-surface border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                >
                  <option value="cliente">Cliente</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              {editUserForm.confirmPassword &&
                editUserForm.password !== editUserForm.confirmPassword && (
                  <p className="text-xs text-red-300">
                    La contraseña y la confirmación no coinciden.
                  </p>
                )}

              <div className="border-t border-cnt-border pt-5">
                <p className="text-white text-sm font-semibold mb-1">
                  Datos del cliente
                </p>
                <p className="text-xs text-gray-500">
                  Estos datos se muestran en listados, peticiones y contacto.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  value={editUserForm.nombre}
                  onChange={(e) =>
                    setEditUserForm((f) => ({ ...f, nombre: e.target.value }))
                  }
                  placeholder="Nombre"
                  className="w-full bg-cnt-surface border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                />

                <input
                  value={editUserForm.apellidos}
                  onChange={(e) =>
                    setEditUserForm((f) => ({ ...f, apellidos: e.target.value }))
                  }
                  placeholder="Apellidos"
                  className="w-full bg-cnt-surface border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  value={editUserForm.telefono}
                  onChange={(e) =>
                    setEditUserForm((f) => ({ ...f, telefono: e.target.value }))
                  }
                  placeholder="Teléfono"
                  className="w-full bg-cnt-surface border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                />

                <input
                  value={editUserForm.empresa}
                  onChange={(e) =>
                    setEditUserForm((f) => ({ ...f, empresa: e.target.value }))
                  }
                  placeholder="Empresa"
                  className="w-full bg-cnt-surface border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                />
              </div>

              <div className="flex flex-wrap justify-end gap-3 border-t border-cnt-border pt-5">
                <button
                  type="button"
                  disabled={savingEditUser}
                  onClick={cancelEditUser}
                  className="cursor-pointer px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-300 hover:text-white rounded-lg text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={savingEditUser}
                  className="cursor-pointer px-4 py-2 bg-cnt-red hover:bg-red-700 disabled:bg-red-900 text-white rounded-lg text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {savingEditUser ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}