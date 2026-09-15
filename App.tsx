import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY ?? '';
const headers: Record<string, string> = API_KEY ? { 'X-API-Key': API_KEY } : {};

// Lo que devuelve GET /icloud/lecturas (solo los campos que usa la pantalla)
type Lectura = {
  id: string;
  estado: 'pendiente' | 'ok' | 'sin_placa' | 'no_decodificable' | 'muy_grande' | 'error';
  placa: string | null;
  propietario: { nombre: string; telefono: string | null; vehiculo: string | null } | null;
  bbox: object | null;
  procesada: string | null;
};

// Lo que se muestra cuando la lectura no trae texto de placa
const SIN_TEXTO: Record<Lectura['estado'], string> = {
  pendiente: 'Leyendo…',
  ok: '—',
  sin_placa: 'Sin placa',
  no_decodificable: 'No se pudo abrir la foto',
  muy_grande: 'La foto es muy grande',
  error: 'Error al leer la foto',
};

export default function App() {
  const [lecturas, setLecturas] = useState<Lectura[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Las recargas automáticas van sin spinner, para que la lista no parpadee
  const cargar = useCallback(async (conSpinner = true) => {
    if (conSpinner) setCargando(true);
    try {
      const r = await fetch(`${API_URL}/icloud/lecturas?limite=50`, { headers });
      if (!r.ok) {
        setError(`La API respondió ${r.status}${r.status === 401 ? ': revisa EXPO_PUBLIC_API_KEY' : ''}`);
        return;
      }
      const datos: { lecturas: Lectura[] } = await r.json();
      setLecturas(datos.lecturas);
      setError(null);
    } catch {
      setError('No se pudo conectar con la API: revisa EXPO_PUBLIC_API_URL');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Las fotos recién llegadas salen "pendiente" y la API lee su placa en
  // segundo plano: se vuelve a pedir la lista hasta que no quede ninguna.
  useEffect(() => {
    if (!lecturas.some((l) => l.estado === 'pendiente')) return;
    const espera = setTimeout(() => cargar(false), 5000);
    return () => clearTimeout(espera);
  }, [lecturas, cargar]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.pantalla}>
        <ScrollView
          contentContainerStyle={styles.lista}
          refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => cargar()} />}
        >
          {error && <Text style={styles.error}>{error}</Text>}
          {lecturas.map((l) => (
            <View key={l.id} style={styles.tarjeta}>
              <FotoPlaca fotoId={l.id} tieneRecorte={l.bbox !== null} version={l.procesada} />
              <Text style={l.placa ? styles.placa : styles.sinPlaca}>{l.placa ?? SIN_TEXTO[l.estado]}</Text>
              {l.propietario && <Dueno propietario={l.propietario} />}
            </View>
          ))}
        </ScrollView>
        <StatusBar style="auto" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// Los datos del dueño, cuando la placa está registrada en /propietarios de la API
function Dueno({ propietario }: { propietario: NonNullable<Lectura['propietario']> }) {
  const detalle = [propietario.vehiculo, propietario.telefono].filter(Boolean).join(' · ');
  return (
    <View style={styles.dueno}>
      <Text style={styles.duenoNombre}>{propietario.nombre}</Text>
      {detalle !== '' && <Text style={styles.duenoDetalle}>{detalle}</Text>}
    </View>
  );
}

// El recorte se baja con fetch y se muestra como data URI: <Image> con headers
// no funciona en web, así la API key viaja igual en Android, iOS y web.
function FotoPlaca({ fotoId, tieneRecorte, version }: { fotoId: string; tieneRecorte: boolean; version: string | null }) {
  const [uri, setUri] = useState<string | null>(null);

  // `version` cambia cuando la foto se reemplaza en iCloud (mismo id)
  useEffect(() => {
    if (!tieneRecorte) return;
    let vigente = true;
    fetch(`${API_URL}/icloud/lecturas/${fotoId}/recorte`, { headers })
      .then((r) => (r.ok ? r.blob() : Promise.reject(r.status)))
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const lector = new FileReader();
            lector.onload = () => resolve(lector.result as string);
            lector.onerror = reject;
            lector.readAsDataURL(blob);
          }),
      )
      .then((dataUri) => vigente && setUri(dataUri))
      .catch(() => vigente && setUri(null));
    return () => {
      vigente = false;
    };
  }, [fotoId, tieneRecorte, version]);

  // Sin placa no hay recorte que mostrar; el hueco gris es mientras baja
  if (!tieneRecorte) return null;
  if (!uri) return <View style={[styles.foto, styles.fotoVacia]} />;
  return <Image source={{ uri }} style={styles.foto} resizeMode="contain" />;
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: '#f2f2f2',
  },
  lista: {
    padding: 16,
    gap: 12,
  },
  tarjeta: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 8,
  },
  foto: {
    width: '100%',
    aspectRatio: 3,
    borderRadius: 8,
  },
  fotoVacia: {
    backgroundColor: '#e4e4e4',
  },
  placa: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 2,
  },
  sinPlaca: {
    fontSize: 16,
    color: '#666',
  },
  dueno: {
    alignItems: 'center',
  },
  duenoNombre: {
    fontSize: 16,
    fontWeight: '600',
  },
  duenoDetalle: {
    fontSize: 14,
    color: '#666',
  },
  error: {
    color: '#b00020',
    textAlign: 'center',
  },
});
