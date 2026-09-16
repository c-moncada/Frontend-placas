import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Platform, Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY ?? '';
const headers: Record<string, string> = API_KEY ? { 'X-API-Key': API_KEY } : {};

// Lo que devuelve GET /icloud/lecturas (solo los campos que usa la pantalla)
type Lectura = {
  id: string;
  nombre: string;
  velocidad_kmh: number | null;
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
  exceso: '#DC2626',
  excesoFondo: '#FEF2F2',
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

  // Límite escrito por el usuario; vacío o inválido = sin límite
  const [textoLimite, setTextoLimite] = useState('');
  const limite = leerLimite(textoLimite);
  const excedidos = limite === null ? [] : lecturas.filter((l) => superoLimite(l, limite));
  const resto = excedidos.length === 0 ? lecturas : lecturas.filter((l) => !excedidos.includes(l));
  const secciones = [
    { clave: 'exceso', data: excedidos },
    { clave: 'resto', data: resto },
  ].filter((s) => s.data.length > 0);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.pantalla}>
        <SectionList
          sections={secciones}
          stickySectionHeadersEnabled={false}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.lista}
          refreshControl={
            <RefreshControl refreshing={cargando && !primeraCarga} onRefresh={() => cargar()} tintColor={color.acento} colors={[color.acento]} />
          }
          ListHeaderComponent={
            <View style={styles.encabezado}>
              <Encabezado lecturas={lecturas} cargando={cargando} onActualizar={() => cargar()} />
              {error && <AvisoError mensaje={error} onReintentar={() => cargar()} />}
              <ControlLimite texto={textoLimite} onCambiar={setTextoLimite} limite={limite} excedidos={excedidos.length} hayLecturas={lecturas.length > 0} />
            </View>
          }
          ListEmptyComponent={primeraCarga ? <Esqueleto /> : error ? null : <ListaVacia />}
          renderSectionHeader={({ section }) =>
            section.clave === 'exceso' ? (
              <AlertaExceso cantidad={excedidos.length} limite={limite!} />
            ) : excedidos.length > 0 ? (
              <Text style={styles.seccionTitulo}>Demás lecturas</Text>
            ) : null
          }
          renderItem={({ item, section }) => {
            const excedio = section.clave === 'exceso' ? limite : null;
            return item.placa ? <TarjetaPlaca lectura={item} limiteExcedido={excedio} /> : <FilaSinPlaca lectura={item} limiteExcedido={excedio} />;
          }}
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

function leerLimite(texto: string): number | null {
  const n = Number(texto.replace(',', '.').trim());
  return texto.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
}

function superoLimite(lectura: Lectura, limite: number) {
  return lectura.velocidad_kmh !== null && lectura.velocidad_kmh > limite;
}

// 45 → "45 km/h", 3.5 → "3.5 km/h"
function kmh(v: number) {
  return `${Number(v.toFixed(1))} km/h`;
}

function ControlLimite({
  texto,
  onCambiar,
  limite,
  excedidos,
  hayLecturas,
}: {
  texto: string;
  onCambiar: (t: string) => void;
  limite: number | null;
  excedidos: number;
  hayLecturas: boolean;
}) {
  const alerta = limite !== null && excedidos > 0;
  const ayuda =
    limite === null
      ? texto.trim() === ''
        ? 'Escribe una velocidad para marcar a los carros que la superen.'
        : 'Escribe solo números, por ejemplo 40.'
      : excedidos > 0
        ? `${excedidos} ${excedidos === 1 ? 'carro superó' : 'carros superaron'} ${kmh(limite)}.`
        : hayLecturas
          ? `Ningún carro superó ${kmh(limite)}.`
          : `Límite: ${kmh(limite)}.`;

  return (
    <View style={[styles.limite, alerta && styles.limiteActivo]}>
      <View style={styles.limiteFila}>
        <Text style={styles.limiteRotulo}>Límite de velocidad</Text>
        <View style={styles.limiteCampo}>
          <TextInput
            value={texto}
            onChangeText={(t) => onCambiar(t.replace(/[^0-9.,]/g, ''))}
            placeholder="—"
            placeholderTextColor="#9CA3AF"
            keyboardType="decimal-pad"
            inputMode="decimal"
            maxLength={5}
            returnKeyType="done"
            accessibilityLabel="Límite de velocidad en kilómetros por hora"
            style={styles.limiteInput}
          />
          <Text style={styles.limiteUnidad}>km/h</Text>
        </View>
      </View>
      <Text style={[styles.limiteAyuda, alerta && styles.limiteAyudaAlerta]}>{ayuda}</Text>
    </View>
  );
}

// Banner rojo sobre los carros que superaron el límite, con un punto que late
function AlertaExceso({ cantidad, limite }: { cantidad: number; limite: number }) {
  const pulso = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const nativo = Platform.OS !== 'web';
    const animacion = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 0.25, duration: 600, useNativeDriver: nativo }),
        Animated.timing(pulso, { toValue: 1, duration: 600, useNativeDriver: nativo }),
      ]),
    );
    animacion.start();
    return () => animacion.stop();
  }, [pulso]);

  return (
    <View style={styles.alerta} accessibilityRole="alert">
      <Animated.View style={[styles.alertaPunto, { opacity: pulso }]} />
      <View style={styles.filaTextos}>
        <Text style={styles.alertaTitulo}>
          {cantidad} {cantidad === 1 ? 'CARRO SUPERÓ' : 'CARROS SUPERARON'} EL LÍMITE
        </Text>
        <Text style={styles.alertaTexto}>Más de {kmh(limite)}</Text>
      </View>
    </View>
  );
}

// Velocidad de la lectura; en rojo y con cuánto se pasó si superó el límite
function Velocidad({ valor, limiteExcedido }: { valor: number | null; limiteExcedido: number | null }) {
  if (valor === null) return null;
  if (limiteExcedido === null) {
    return (
      <View style={[styles.etiqueta, { backgroundColor: tonos.neutro.fondo }]}>
        <Text style={[styles.etiquetaTexto, { color: tonos.neutro.texto }]}>{kmh(valor)}</Text>
      </View>
    );
  }
  return (
    <View style={styles.velocidadExceso}>
      <Text style={styles.velocidadExcesoTexto}>{kmh(valor)}</Text>
      <Text style={styles.velocidadExcesoExtra}>+{kmh(valor - limiteExcedido)}</Text>
    </View>
  );
}

// Lectura con placa: el recorte, la placa como placa y el dueño si está registrado
function TarjetaPlaca({ lectura, limiteExcedido }: { lectura: Lectura; limiteExcedido: number | null }) {
  const excedio = limiteExcedido !== null;
  return (
    <View style={[styles.tarjeta, excedio && styles.tarjetaExceso]}>
      {excedio && <Text style={styles.franjaExceso}>SUPERÓ EL LÍMITE</Text>}
      <FotoPlaca fotoId={lectura.id} tieneRecorte={lectura.bbox !== null} version={lectura.procesada} />
      <View style={styles.tarjetaCuerpo}>
        <View style={styles.tarjetaFila}>
          <Placa texto={lectura.placa!} />
          <View style={styles.chips}>
            <Velocidad valor={lectura.velocidad_kmh} limiteExcedido={limiteExcedido} />
            <Etiqueta estado={lectura.estado} />
          </View>
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
function FilaSinPlaca({ lectura, limiteExcedido }: { lectura: Lectura; limiteExcedido: number | null }) {
  const { etiqueta, tono } = ESTADOS[lectura.estado];
  return (
    <View style={[styles.fila, limiteExcedido !== null && styles.filaExceso]}>
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
      <View style={styles.filaDerecha}>
        <Velocidad valor={lectura.velocidad_kmh} limiteExcedido={limiteExcedido} />
        <Text style={styles.meta}>{cuando(lectura.procesada ?? lectura.subida)}</Text>
      </View>
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
  tarjetaExceso: {
    borderWidth: 2,
    borderColor: color.exceso,
  },
  franjaExceso: {
    backgroundColor: color.exceso,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  velocidadExceso: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    backgroundColor: color.exceso,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  velocidadExcesoTexto: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  velocidadExcesoExtra: {
    color: '#FEE2E2',
    fontSize: 12,
    fontWeight: '700',
  },
  limite: {
    gap: 8,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.borde,
    backgroundColor: color.superficie,
  },
  limiteActivo: {
    borderColor: color.exceso,
    backgroundColor: color.excesoFondo,
  },
  limiteFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  limiteRotulo: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: color.texto,
  },
  limiteCampo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.borde,
    backgroundColor: '#FFFFFF',
  },
  limiteInput: {
    width: 64,
    minHeight: 44,
    fontSize: 20,
    fontWeight: '700',
    color: color.texto,
    textAlign: 'right',
  },
  limiteUnidad: {
    fontSize: 15,
    color: color.textoSuave,
  },
  limiteAyuda: {
    fontSize: 14,
    color: color.textoSuave,
  },
  limiteAyudaAlerta: {
    color: color.exceso,
    fontWeight: '600',
  },
  alerta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: color.exceso,
  },
  alertaPunto: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
  },
  alertaTitulo: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  alertaTexto: {
    color: '#FEE2E2',
    fontSize: 14,
    fontWeight: '600',
  },
  seccionTitulo: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: color.textoSuave,
    marginTop: 16,
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
  filaExceso: {
    borderWidth: 2,
    borderColor: color.exceso,
    backgroundColor: color.excesoFondo,
  },
  filaDerecha: {
    alignItems: 'flex-end',
    gap: 4,
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
