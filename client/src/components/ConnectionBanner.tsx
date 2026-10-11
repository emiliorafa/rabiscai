import type { ConnStatus } from '../hooks/useGame';

export function ConnectionBanner({ status }: { status: ConnStatus }) {
  if (status === 'connected') return null;
  return (
    <div className="conn-banner" role="alert">
      <span className="spinner" aria-hidden="true" />
      {status === 'connecting' ? 'Conectando ao servidor…' : 'Conexão perdida. Tentando reconectar — seu lugar na sala fica guardado por alguns segundos.'}
    </div>
  );
}
