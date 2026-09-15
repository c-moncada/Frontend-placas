import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY ?? '';
const headers: Record<string, string> = API_KEY ? { 'X-API-Key': API_KEY } : {};

// Lo que devuelve GET /icloud/lecturas (solo los campos que usa la pantalla)
type Lectura = {
  id: string;
  nombre: string;
  subida: string;
  estado: 'pendiente' | 'ok' | 'sin_placa' | 'no_decodificable' | 'muy_grande' | 'error';
  placa: string | null;
  propietario: { nombre: string; telefono: string | null; vehiculo: string | null } | null;
  bbox: object | null;
  procesada: string | null;
};

const color = {
  fondo: '#F1F3F6',
  superficie: '#FFFFFF',
  borde: '#E2E6EC',
  texto: '#111827',
  textoSuave: '#4B5563',
  foto: '#111827',
  hueco: '#E5E7EB',
  acento: '#1D4ED8',
  acentoPresionado: '#1E40AF',
};

type Tono = 'ok' | 'info' | 'aviso' | 'error' | 'neutro';
const tonos: Record<Tono, { texto: string; fondo: string }> = {
  ok: { texto: '#047857', fondo: '#D1FAE5' },
  info: { texto: '#1D4ED8', fondo: '#DBEAFE' },
  aviso: { texto: '#B45309', fondo: '#FEF3C7' },
  error: { texto: '#B91C1C', fondo: '#FEE2E2' },
  neutro: { texto: '#4B5563', fondo: '#E5E7EB' },
};

// Cómo se nombra cada estado en pantalla; el texto siempre acompaña al color
const ESTADOS: Record<Lectura['estado'], { etiqueta: string; tono: Tono }> = {
  pendiente: { etiqueta: 'Leyendo…', tono: 'info' },
  ok: { etiqueta: 'Leída', tono: 'ok' },
  sin_placa: { etiqueta: 'Sin placa', tono: 'neutro' },
  no_decodificable: { etiqueta: 'No se pudo abrir la foto', tono: 'error' },
  muy_grande: { etiqueta: 'La foto es muy grande', tono: 'aviso' },
  error: { etiqueta: 'Error al leer la foto', tono: 'error' },
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

  const primeraCarga = cargando && lecturas.length === 0;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.pantalla}>
        <FlatList
          data={lecturas}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.lista}
          refreshControl={
            <RefreshControl refreshing={cargando && !primeraCarga} onRefresh={() => cargar()} tintColor={color.acento} colors={[color.acento]} />
          }
          ListHeaderComponent={
            <View style={styles.encabezado}>
              <Encabezado lecturas={lecturas} cargando={cargando} onActualizar={() => cargar()} />
              {error && <AvisoError mensaje={error} onReintentar={() => cargar()} />}
            </View>
          }
          ListEmptyComponent={primeraCarga ? <Esqueleto /> : error ? null : <ListaVacia />}
          renderItem={({ item }) => (item.placa ? <TarjetaPlaca lectura={item} /> : <FilaSinPlaca lectura={item} />)}
        />
        <StatusBar style="dark" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Encabezado({ lecturas, cargando, onActualizar }: { lecturas: Lectura[]; cargando: boolean; onActualizar: () => void }) {
  const conPlaca = lecturas.filter((l) => l.placa).length;
  const leyendo = lecturas.filter((l) => l.estado === 'pendiente').length;
  const resumen = [
    `${lecturas.length} ${lecturas.length === 1 ? 'foto' : 'fotos'}`,
    `${conPlaca} con placa`,
    leyendo > 0 && `${leyendo} leyendo`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.encabezadoFila}>
      <View style={styles.encabezadoTextos}>
        <Text style={styles.titulo} accessibilityRole="header">
          Placas
        </Text>
        <Text style={styles.resumen}>{lecturas.length > 0 ? resumen : 'Fotos de iCloud'}</Text>
      </View>
      <Pressable
        onPress={onActualizar}
        disabled={cargando}
        accessibilityRole="button"
        accessibilityLabel="Actualizar lista"
        accessibilityState={{ disabled: cargando, busy: cargando }}
        style={({ pressed }) => [styles.boton, pressed && styles.botonPresionado, cargando && styles.botonDeshabilitado]}
      >
        {cargando ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.botonTexto}>Actualizar</Text>}
      </Pressable>
    </View>
  );
}

function AvisoError({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <View style={styles.aviso} accessibilityRole="alert">
      <Text style={styles.avisoTexto}>{mensaje}</Text>
      <Pressable
        onPress={onReintentar}
        accessibilityRole="button"
        hitSlop={8}
        style={({ pressed }) => [styles.avisoBoton, pressed && { opacity: 0.6 }]}
      >
        <Text style={styles.avisoBotonTexto}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

// Lectura con placa: el recorte, la placa como placa y el dueño si está registrado
function TarjetaPlaca({ lectura }: { lectura: Lectura }) {
  return (
    <View style={styles.tarjeta}>
      <FotoPlaca fotoId={lectura.id} tieneRecorte={lectura.bbox !== null} version={lectura.procesada} />
      <View style={styles.tarjetaCuerpo}>
        <View style={styles.tarjetaFila}>
          <Placa texto={lectura.placa!} />
          <Etiqueta estado={lectura.estado} />
        </View>
        {lectura.propietario ? <Dueno propietario={lectura.propietario} /> : <Text style={styles.sinDueno}>Placa sin dueño registrado</Text>}
        <Text style={styles.meta} numberOfLines={1}>
          {cuando(lectura.procesada ?? lectura.subida)} · {lectura.nombre}
        </Text>
      </View>
    </View>
  );
}

// Lectura sin placa: una fila compacta, para que no ocupe lo mismo que una placa leída
function FilaSinPlaca({ lectura }: { lectura: Lectura }) {
  const { etiqueta, tono } = ESTADOS[lectura.estado];
  return (
    <View style={styles.fila}>
      <View style={styles.filaIndicador}>
        {lectura.estado === 'pendiente' ? (
          <ActivityIndicator size="small" color={tonos.info.texto} />
        ) : (
          <View style={[styles.punto, { backgroundColor: tonos[tono].texto }]} />
        )}
      </View>
      <View style={styles.filaTextos}>
        <Text style={styles.filaEstado}>{lectura.estado === 'ok' ? 'Sin texto de placa' : etiqueta}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {lectura.nombre}
        </Text>
      </View>
      <Text style={styles.meta}>{cuando(lectura.procesada ?? lectura.subida)}</Text>
    </View>
  );
}

function Placa({ texto }: { texto: string }) {
  return (
    <View style={styles.placa} accessible accessibilityLabel={`Placa ${texto.split('').join(' ')}`}>
      <Text style={styles.placaTexto}>{texto}</Text>
    </View>
  );
}

function Etiqueta({ estado }: { estado: Lectura['estado'] }) {
  const { etiqueta, tono } = ESTADOS[estado];
  return (
    <View style={[styles.etiqueta, { backgroundColor: tonos[tono].fondo }]}>
      <Text style={[styles.etiquetaTexto, { color: tonos[tono].texto }]}>{etiqueta}</Text>
    </View>
  );
}

// Los datos del dueño, cuando la placa está registrada en /propietarios de la API
function Dueno({ propietario }: { propietario: NonNullable<Lectura['propietario']> }) {
  const detalle = [propietario.vehiculo, propietario.telefono].filter(Boolean).join(' · ');
  return (
    <View style={styles.dueno}>
      <Text style={styles.duenoRotulo}>DUEÑO</Text>
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

  // Sin recorte no hay nada que mostrar; el marco vacío es mientras baja
  if (!tieneRecorte) return null;
  return (
    <View style={styles.foto}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" accessibilityLabel="Recorte de la placa en la foto" />
      ) : (
        <ActivityIndicator color="#9CA3AF" />
      )}
    </View>
  );
}

function Esqueleto() {
  return (
    <View style={styles.esqueleto} accessibilityLabel="Cargando lecturas">
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.fila, styles.esqueletoFila]}>
          <View style={[styles.punto, { backgroundColor: color.hueco }]} />
          <View style={styles.filaTextos}>
            <View style={[styles.esqueletoBarra, { width: '40%' }]} />
            <View style={[styles.esqueletoBarra, { width: '70%' }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

function ListaVacia() {
  return (
    <View style={styles.vacia}>
      <Text style={styles.vaciaTitulo}>Aún no hay fotos</Text>
      <Text style={styles.vaciaTexto}>Las fotos que subas a iCloud aparecerán aquí con su placa.</Text>
    </View>
  );
}

// "ahora", "hace 5 min", "hace 3 h", "ayer" o la fecha; sin Intl, que Hermes no trae completo
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function cuando(iso: string) {
  const fecha = new Date(iso);
  const minutos = Math.floor((Date.now() - fecha.getTime()) / 60000);
  if (minutos < 1) return 'ahora';
  if (minutos < 60) return `hace ${minutos} min`;
  if (minutos < 24 * 60) return `hace ${Math.floor(minutos / 60)} h`;
  if (minutos < 48 * 60) return 'ayer';
  return `${fecha.getDate()} ${MESES[fecha.getMonth()]}`;
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: color.fondo,
  },
  lista: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 8,
  },
  encabezado: {
    gap: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  encabezadoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  encabezadoTextos: {
    flex: 1,
    gap: 2,
  },
  titulo: {
    fontSize: 30,
    fontWeight: '800',
    color: color.texto,
    letterSpacing: -0.5,
  },
  resumen: {
    fontSize: 15,
    color: color.textoSuave,
  },
  boton: {
    minHeight: 44,
    minWidth: 112,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: color.acento,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonPresionado: {
    backgroundColor: color.acentoPresionado,
  },
  botonDeshabilitado: {
    opacity: 0.7,
  },
  botonTexto: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: tonos.error.fondo,
  },
  avisoTexto: {
    flex: 1,
    fontSize: 15,
    color: tonos.error.texto,
  },
  avisoBoton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  avisoBotonTexto: {
    fontSize: 15,
    fontWeight: '700',
    color: tonos.error.texto,
  },
  tarjeta: {
    backgroundColor: color.superficie,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.borde,
    overflow: 'hidden',
  },
  foto: {
    width: '100%',
    aspectRatio: 2.4,
    backgroundColor: color.foto,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tarjetaCuerpo: {
    padding: 16,
    gap: 12,
  },
  tarjetaFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  placa: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: color.texto,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  placaTexto: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 3,
    color: color.texto,
    fontVariant: ['tabular-nums'],
  },
  etiqueta: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  etiquetaTexto: {
    fontSize: 13,
    fontWeight: '600',
  },
  dueno: {
    gap: 2,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: color.borde,
  },
  duenoRotulo: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: color.textoSuave,
    marginBottom: 2,
  },
  duenoNombre: {
    fontSize: 17,
    fontWeight: '600',
    color: color.texto,
  },
  duenoDetalle: {
    fontSize: 15,
    color: color.textoSuave,
  },
  sinDueno: {
    fontSize: 15,
    color: color.textoSuave,
  },
  meta: {
    fontSize: 13,
    color: color.textoSuave,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: color.superficie,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.borde,
  },
  filaIndicador: {
    width: 20,
    alignItems: 'center',
  },
  punto: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  filaTextos: {
    flex: 1,
    gap: 2,
  },
  filaEstado: {
    fontSize: 15,
    fontWeight: '600',
    color: color.texto,
  },
  esqueleto: {
    gap: 8,
  },
  esqueletoFila: {
    opacity: 0.8,
  },
  esqueletoBarra: {
    height: 10,
    borderRadius: 5,
    backgroundColor: color.hueco,
    marginVertical: 3,
  },
  vacia: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 6,
  },
  vaciaTitulo: {
    fontSize: 17,
    fontWeight: '600',
    color: color.texto,
  },
  vaciaTexto: {
    fontSize: 15,
    color: color.textoSuave,
    textAlign: 'center',
  },
});
