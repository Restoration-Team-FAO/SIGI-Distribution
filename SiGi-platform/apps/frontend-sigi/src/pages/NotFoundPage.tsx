import { useNavigate } from 'react-router-dom';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <section
      aria-labelledby="not-found-title"
      style={{ padding: 32, border: '1px solid #d7dde5', borderRadius: 24, background: '#ffffff' }}
    >
      <span style={{ color: '#667085', fontWeight: 700 }}>Error 404</span>
      <h1 id="not-found-title" style={{ margin: '8px 0' }}>Página no encontrada</h1>
      <p style={{ color: '#5f6b7a', lineHeight: 1.6 }}>
        La dirección solicitada no corresponde a una pantalla registrada en SIGI.
      </p>
      <button
        type="button"
        onClick={() => navigate('/admin')}
        style={{ border: 'none', borderRadius: 12, padding: '12px 16px', background: '#0b4f3a', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}
      >
        Volver al inicio
      </button>
    </section>
  );
}
