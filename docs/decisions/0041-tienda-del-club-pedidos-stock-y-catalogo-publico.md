# 0041. Tienda del club: productos con stock, pedidos cobrados como una cuota y catálogo público para la web del club

Estado: aceptada. Fecha: 2026-10-23. Se apoya en las cuotas y Stripe de la 0031.

## Contexto

Producto pidió que los clubes vendan desde la aplicación: camisetas, pantalones de entreno, pagos extra de cenas, salidas. Tres piezas, sencillas para empezar:

1. Un admin para gestionar productos, stock y pedidos como un ecommerce.
2. La tienda en la página de deportistas y familias. La familia compra solo si sus deportistas son menores.
3. Un espacio para desarrolladores: que la web pública del club enseñe los productos dados de alta.

El club ya cobra cuotas a mano o por Stripe (ADR 0031). Un pedido es dinero que una persona debe al club: lo mismo que un cargo.

## Decisión

### Productos y stock

- **Producto** (`store_products`):
  - Nombre, descripción, categoría (ropa, material, eventos, salidas, otros), precio en céntimos y foto.
  - Estado: borrador, a la venta o archivado.
  - Visibilidad: solo en la app, o también en la web del club.
  - Ámbito: todo el club, una sección o un equipo, como el reto (ADR 0032).
  - Último día de venta, opcional: la cena cierra inscripciones.
- **Opciones** (`store_product_variants`): siempre al menos una por producto.
  - Una opción sin nombre es un producto sin tallas.
  - Cada opción lleva su stock; nulo es sin límite (una inscripción, un pago extra).
  - Así hay un solo camino de stock, con o sin tallas.
- **Stock sencillo**: un número por opción.
  - El pedido lo baja en la misma transacción que lo crea, con las opciones bloqueadas (`FOR UPDATE`): dos familias no compran la última talla a la vez.
  - Anular el pedido lo devuelve.
  - Ajustar el stock es editar el producto, y queda en la auditoría.
- La foto vive en Netlify Blobs (`store-images`, eu-central-1), como logos y fotos de jugador (ADR 0024).
  - Se reduce en el navegador y se comprueba por sus primeros bytes.
  - Se sirve sin sesión en `/api/store/products/{id}/image`: es material de venta que también ve la web del club, y el id es un UUID.

### Pedidos cobrados como una cuota

- **Pedido** (`store_orders`, `store_order_items`):
  - Para una persona: el deportista menor o el propio adulto.
  - Lo hace una cuenta, con número correlativo por club (`T-0012`).
  - Canal: la app o el mostrador del club.
  - Las líneas guardan nombre, opción y precio de cuando se compró.
- **Estados**: recibido, listo para recoger, entregado, anulado.
  - Entre los tres primeros se va y se vuelve: un toque equivocado se deshace.
  - Anular solo antes de entregar, y un anulado no cambia más.
- **El cobro es un cargo de cuotas** (`fee_charges`): concepto `Pedido T-0012 · Tienda`, vence a los siete días.
  - La familia lo ve en "Mis cuotas" y en "Mis pedidos".
  - El pago por Stripe usa el Checkout y el webhook que ya existen. El pago a mano es el de siempre.
  - El estado del cobro del pedido sale de su cargo.
  - Un pedido de importe cero no abre cargo.
- **Anular**: devuelve el stock y anula el cargo si no se ha cobrado nada.
  - Si ya se cobró, el cargo se queda y la API devuelve cuánto reembolsar. El reembolso se hace fuera, por el mismo medio.
- La familia anula lo suyo mientras está recibido y sin pagar. Después, se lo pide al club.

### Quién compra

- **Sin permiso nuevo para comprar**: lo da ser quien es.
  - La familia compra para los menores de los que es familia.
  - El deportista adulto con su cuenta compra para sí mismo.
  - La familia de un adulto no compra por él.
  - Sin fecha de nacimiento, el familiar se trata como menor y la cuenta propia como adulto.
- La API comprueba en cada pedido:
  - Que la persona es una de las suyas.
  - Que el producto está a la venta.
  - Que no ha pasado su último día.
  - Que el ámbito incluye a esa persona por sus equipos de esta temporada.
- El actor de `GET /api/org` gana `canShop`: hay alguien para quien comprar y algo a la venta para esa persona.
  - Sin eso, la tienda no aparece en la navegación ni en la página.
  - La tienda queda fijada en "Mi familia" y en "Mi bienestar": tarjeta con tres productos y el enlace.
- La cesta separa para quién es cada cosa: un pedido por persona.
  - Vive en la sesión del navegador.
  - Hacer el pedido pide confirmación, porque abre un cobro (DESIGN.md, regla 6).

### Gestión

- **Permisos**: `org.store.read` y `org.store.write`.
  - La administración los tiene.
  - Nueva área `store` en "Personal" para abrírsela a un cargo, por ejemplo a la delegación que lleva el material (ADR 0033).
- **Pantalla "Tienda"**:
  - Pedidos con cifras (por preparar, listos, por cobrar), filtro por estado, búsqueda y descarga a Excel. El Excel trae tres hojas: pedidos, líneas y lo que hay que preparar por producto y talla, para pedírselo al proveedor.
  - Productos con stock, vendidas, agotadas y pocas unidades.
  - Ficha del pedido con preparar, entregar, cobrar a mano y anular.
  - Venta en el mostrador, para cualquier persona del club.
- **Inicio**: dos alertas, pedidos por preparar y tallas agotadas de lo que está a la venta.
- **Paleta de mandos**: producto nuevo, venta en el mostrador y catálogo público.
- **Auditoría**: ocho acciones nuevas (producto, foto, pedido, anulación y clave pública).

### Catálogo público para la web del club

- **Clave publicable por club** (`organizations.public_api_key`, `pk_` + 32 hexadecimales).
  - Como la clave publicable de Stripe: va a la vista en el código de la web del club y solo da acceso a lo público.
  - Se crea, se cambia (la anterior deja de funcionar al momento) y se apaga desde Ajustes, Desarrolladores.
  - Gestionarla pide `org.settings.write`: la familia lee los ajustes y no debe verla.
- **API de solo lectura**:
  - `GET /api/public/v1/catalog`: el club (nombre, logo, colores, enlace a la tienda) y sus productos.
  - `GET /api/public/v1/catalog/products/{id}`: un producto.
  - La clave va en la cabecera `x-sm-key` o en la query `key`, para incrustar sin código.
  - Sin clave o con una apagada: 401.
  - CORS abierto y un minuto de caché.
- **Qué devuelve**: solo lo activo, a la venta y marcado como público.
  - Precio en céntimos con moneda, foto y enlaces absolutos.
  - Disponibilidad como sí o no, sin enseñar el almacén.
  - Enlace de compra a la tienda en la app (`/<club>/store?product=<id>`): la familia entra con su cuenta y compra allí.
- **Ajustes, Desarrolladores**:
  - Estado y clave.
  - Los dos endpoints.
  - Código para pegar con la clave puesta: HTML que pinta los productos con foto, precio y enlace, JavaScript y curl.
  - "Probar ahora", que llama a la API como lo haría la web del club.
  - Enlace a la documentación OpenAPI (`/api/docs`), donde la API pública tiene su propia etiqueta.

## Consecuencias

- **Base**: cuatro tablas nuevas con `organization_id` (ADR 0015) y una columna en `organizations`.
  - Migración `20261023200549_store`, que amplía la restricción de áreas de `access_rules`.
  - Semilla `20261023200550_seed_demo_store`: siete productos (uno en borrador, cuatro públicos) y tres pedidos. El de Clara Martí está listo y por pagar, el de Miguel Lozano entregado y pagado, y uno de mostrador recién recibido.
- **Contratos**: los compartidos crecen con `store.ts` y `api/store.ts`. `OperationsSummary` gana dos cifras y el actor gana `canShop`, opcional.
- **Pruebas**:
  - Suite de aislamiento `store.isolation.test.ts`: quién compra y para quién, stock con pedidos y anulaciones, cobro con su cargo, mostrador, fotos, clave pública y nada cruzado entre clubes.
  - `tienda.spec.ts` recorre la tienda de punta a punta en escritorio y en móvil.
- El cobro no duplica nada: Stripe, el webhook, los pagos a mano y "Mis cuotas" son los de la 0031. Los cargos de la tienda aparecen también en Cuotas.
- **Queda para después**:
  - Compra sin cuenta desde la web del club (pide datos de quien compra y Stripe conectado).
  - Envíos y direcciones.
  - Precio de socio y de no socio.
  - Límite por persona.
  - Movimientos de stock con su historial y avisos de reposición por email.
  - Reembolsos por Stripe desde la app.
  - Tallas por plantilla del club.
  - Varias fotos por producto.
  - Cupones.
  - Un widget oficial alojado por la plataforma.

## Alternativas descartadas

- **Pedidos con su propio cobro, sin cargo de cuotas**: dos sitios para lo que se debe, dos integraciones con Stripe y dos conciliaciones. El cargo ya resuelve pago a mano, Stripe, webhook idempotente y vencimiento.
- **Stock en el producto y, aparte, en las tallas**: dos caminos para lo mismo. Una opción sin nombre cubre el producto sin tallas.
- **Tabla de movimientos de stock desde el primer día**: producto pidió algo sencillo. La auditoría y las líneas de pedido dan el rastro hasta que haga falta.
- **Catálogo público sin clave, solo con el slug**: no se puede apagar ni rotar si alguien abusa. La clave cuesta lo mismo y deja el control al club.
- **Clave secreta con su hash**: el catálogo es público por definición. Una clave secreta acabaría igualmente en el código de la web.
- **Un permiso `org.store.buy`**: quién compra depende de la edad y de la familia, no del rol. Un permiso daría acceso a quien no debe (la familia de un adulto) o pediría configurarlo a mano.
- **Exponer el stock exacto en la API pública**: es información del club. La web solo necesita saber si hay o no hay.
