# 0007. Región UE: Frankfurt para funciones y base, eu-central-1 para Blobs

Estado: aceptada. Fecha: 2026-10-19.

## Contexto

Datos de menores. Los datos personales se procesan y almacenan en la UE.

## Decisión

- Netlify Functions: región `fra` (Frankfurt) a nivel de proyecto, que cubre las funciones generadas por el adaptador de Next.js, y además `region: "fra"` en la función de la API.
- Netlify Database: se aprovisiona con las funciones ya en `fra`. La documentación accesible no lista regiones de base de datos; la API de Netlify admite un parámetro de región y Netlify indica que la base sigue a la región de las funciones. Es obligatorio verificar la región real tras aprovisionar y parar si no es UE.
- Netlify Blobs: `region: "eu-central-1"` en todas las llamadas, centralizado en un único módulo, porque los stores de proyecto usan `us-east-2` por defecto y no siguen la región de las funciones.
- Next.js middleware se ejecuta como Edge Function global, fuera de la región: no se usa para nada que toque datos personales. Autenticación y autorización solo en la API.

## Consecuencias

- Latencia algo mayor para usuarios fuera de Europa; irrelevante para el mercado objetivo.
- La región de funciones y la selección de región de Blobs requieren plan Pro o superior. El equipo está en Pro.
- Verificación pendiente de la región de la base en el Bloque 1.

## Alternativas descartadas

- Dublín (`dub`): válido, pero Blobs solo ofrece `eu-central-1` en la UE y conviene tener funciones y almacenamiento juntos.
- Londres (`lhr`): fuera de la UE.
