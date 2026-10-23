# 0042. Pasarela de pago con Stripe Connect y contabilidad conectada con Holded

Estado: aceptada. Fecha: 2026-10-23. Amplía la 0031 (cuotas y Stripe) y la 0041 (tienda).

## Contexto

Las cuotas y la tienda ya se cobran a mano o por Stripe Checkout (ADR 0031 y 0041). Faltaban tres cosas:

1. **Explicar en Cuotas qué hace falta para cobrar en línea.** El club veía un selector "A mano / Stripe" en Ajustes sin saber por qué ni cómo.
2. **Conectar la cuenta de Stripe de verdad.** El identificador `acct_…` se escribía a mano: ningún club lo tiene sin un alta en Connect.
3. **Llevar la contabilidad sin teclear dos veces.** El club emite las cuotas en la app y las vuelve a meter en su herramienta de facturación. Producto pidió conectores, empezando por Holded, y pasó la documentación de su API v2 (OpenAPI 3.1, `Authorization: Bearer`, problem+json, 100 peticiones por minuto).

## Decisión

### Cuotas explica la pasarela

- **Pestaña "Pasarela y contabilidad"** en Cuotas, para quien las gestiona:
  - Por qué conectar Stripe: pago con tarjeta desde la app, apunte automático, el dinero va a la cuenta del club, comisión de Stripe.
  - Los tres pasos con su estado: claves en la plataforma, cuenta del club, cobro activado. El botón que toca en cada momento.
  - La contabilidad: qué hace Holded por el club, lo enviado, lo pendiente, las incidencias y "Sincronizar ahora".
- **Aviso en Cargos** mientras el club cobra a mano, con el enlace a esa pestaña.

### Stripe Connect con cuentas Standard

- **Alta desde Ajustes, Cobros**: "Conectar con Stripe" crea la cuenta del club (`POST /v1/accounts`, `type=standard`, país ES, nombre del club) y un enlace de alta (`POST /v1/account_links`). El club rellena sus datos y su banco en Stripe y vuelve.
  - Al volver (`?stripe=return`) la web pregunta por la cuenta. Si el enlace caducó (`?stripe=refresh`), pide otro.
  - Volver a pulsar no crea otra cuenta: continúa el alta.
- **Estado de la cuenta** (`organizations.stripe_account_status`): `onboarding`, `restricted` (datos enviados, Stripe revisa) o `enabled` (cobra). Lo actualizan la vuelta del alta, "Comprobar el estado" y el webhook `account.updated`.
- **Activar el cobro por Stripe** exige claves en la plataforma, cuenta y que la cuenta pueda cobrar. Una cuenta escrita a mano, de la que Stripe aún no ha dicho nada, se acepta como hasta ahora.
- **Webhook más estricto** (`/api/webhooks/stripe`, de Connect):
  - Solo apunta el pago si el evento viene de la cuenta del club del cargo (`event.account`). Una cuenta de otro club no puede marcar como pagado un cargo ajeno.
  - Con `payment_status` distinto de `paid` (SEPA y otros pagos que tardan) no apunta nada; lo hace `checkout.session.async_payment_succeeded`.

### Conector de contabilidad

- **Una interfaz por proveedor** (`services/accounting/provider.ts`), como los cobros y el email, y Holded como primera implementación (`holded.ts`): `fetch` directo, sin SDK.
  - Contactos: buscar por NIF o email antes de crear, para no duplicar.
  - Documentos: factura (`/invoices`) o ticket (`/sales-receipts`), aprobar si el club lo pide, anular (cancelar la factura o borrar el borrador).
  - Pagos contra el documento, con su cuenta de tesorería.
  - Impuestos (solo los de venta), series de numeración y cuentas de tesorería, para que el club elija.
  - Errores traducidos: clave no válida o sin permisos, límite de peticiones (con `retry-after`), rechazo con su motivo y caída.
- **Clave cifrada** (`services/secret-box.ts`): AES-256-GCM con Web Crypto, clave derivada por HKDF-SHA256 del nuevo `INTEGRATIONS_SECRET` y el id del club como dato asociado. La clave se comprueba contra Holded antes de guardarla, ninguna respuesta la devuelve y solo se enseñan sus cuatro últimos caracteres. Sin secreto (fuera de local) no se conecta nada, como Stripe y Resend.
- **Qué se manda por cada cargo**:
  - El documento va a nombre de quien paga: el primer familiar con ficha del deportista o, si no tiene, la propia persona. La línea dice de quién es la cuota.
  - Fecha de emisión, hoy (un documento con fecha pasada rompería el orden de la serie). Vencimiento, el del cargo o hoy si ya pasó.
  - Precio sin impuesto, con cuatro decimales, para que al sumar el impuesto Holded vuelva al importe de la app. Por defecto, sin impuesto: muchas cuotas de clubes sin ánimo de lucro están exentas (art. 20.1.13 LIVA), y la pantalla pide confirmarlo con la gestoría.
  - Un pedido de la tienda lleva sus líneas (producto, talla, unidades). Etiquetas `cuotas` o `tienda` y la referencia del cargo en las notas.
  - Por defecto los documentos quedan en borrador; aprobarlos al crearlos es una opción.
- **Enlaces, no cola** (`accounting_connections`, `accounting_links`):
  - Lo pendiente se deduce: cargos sin documento desde la fecha elegida, cargos anulados con documento, pagos de cargos ya enviados. Ningún cambio de cuotas o de la tienda tiene que acordarse de avisar.
  - Cada cosa se reserva (`pending`) antes de mandarla: dos tandas a la vez no la duplican, y una reserva colgada más de dos minutos se retoma.
  - Un rechazo deja el enlace `failed` con su motivo y se reintenta hasta cinco veces. Lo que no tiene arreglo desde la app (anular un documento ya aprobado o cobrado pide rectificativa en Holded) queda como aviso y no se reintenta solo.
  - Un fallo de conexión (clave revocada, límite, caída) para la tanda sin gastar intentos y queda en la conexión.
- **Cuándo sale**:
  - "Sincronizar ahora": tandas de veinte cosas y ocho segundos que la web encadena hasta acabar.
  - "Enviar al momento" (por defecto): tras emitir un cargo suelto, cobrarlo a mano o por Stripe, anularlo o reactivarlo, y con los pedidos de la tienda, el cargo sale solo después de responder (`waitUntil` de Netlify; en local y en tests se espera).
  - Generar los cargos de un periodo no los envía uno a uno: salen en la siguiente tanda.
- **Conectar no vuelca el histórico**: se envía lo creado desde hoy. El club puede adelantar la fecha.
- **Desconectar** borra la clave y los enlaces. Lo enviado se queda en Holded.
- **Cifras en la lista de cargos**: cada cargo dice si su documento está por enviar, enviado (con su número), con incidencia o anulado.
- **Permisos**: ver con `org.fees.read`, sincronizar y reintentar con `org.fees.write`, conectar, configurar, cambiar la clave y desconectar con `org.settings.write`. Ninguno nuevo.
- **Auditoría**: seis acciones nuevas (alta en Stripe iniciada, contabilidad conectada, cambiada, desconectada, sincronizada y reintentada).

## Consecuencias

- **Base**: migración `20261023212845_accounting_connectors`, con dos tablas con `organization_id` (ADR 0015) y una columna en `organizations`. Las pruebas de esquema cubren las restricciones y el borrado en cascada.
- **Contratos**: `accounting.ts` y `api/accounting.ts` nuevos. El cargo gana `accounting` y los ajustes de cobro `stripeAccountStatus`.
- **Pruebas**:
  - Unitarias del conector contra un Holded falso con estado, de la caja de secretos y del documento de cada cargo.
  - Suite de aislamiento `accounting.isolation.test.ts`: conectar con clave comprobada y cifrada, impuestos y tesorería, cargos con su contacto y una sola vez, pagos a mano y por Stripe que llegan solos, anular y reactivar, rechazo con reintento, aprobación con número y aviso de rectificativa, clave revocada, pausa, la tienda y desconectar.
  - La suite de cuotas suma Stripe Connect (alta, estado, `account.updated`) y el webhook estricto.
  - `conexiones.spec.ts` recorre la pestaña nueva y los ajustes en escritorio y móvil.
- **Operación**: hay que crear `INTEGRATIONS_SECRET` y, para cobrar, las claves de Stripe con un webhook de Connect (`docs/deploy.md`). Cambiar el secreto deja ilegibles las claves guardadas.
- **No verificado desde aquí**: la API real de Holded (todo se ha probado contra la documentación) y la forma exacta de su `GET /account` y de la respuesta de un pago, que la documentación no fija; el conector las lee con tolerancia. Antes de abrirlo a clubes, una prueba con una cuenta de Holded de verdad.
- **Queda para después**:
  - Más conectores detrás de la misma interfaz (A3, Sage, Contasimple, Xero, QuickBooks) y exportación contable a fichero para quien no use ninguno.
  - Remesas SEPA en Holded para las domiciliaciones.
  - Rectificativas desde la app al anular un documento aprobado.
  - Webhooks de Holded de vuelta (su firma no está documentada).
  - Tanda programada cuando haya tareas programadas.
  - Comisión de la plataforma en Stripe (`application_fee_amount`).
  - Reembolsos por Stripe desde la app.

## Alternativas descartadas

- **Cola de envíos en una tabla**: cada mutación de cuotas, tienda y webhook tendría que escribir en ella, y un olvido dejaría un cargo sin factura. Los enlaces más la deducción de lo pendiente no se olvidan de nada.
- **Enviar todo en el momento, dentro de la petición**: generar las cuotas de un mes son cientos de llamadas, por encima del límite de Holded y del tiempo de la función.
- **Guardar la clave en claro o con hash**: en claro, una copia de la base daría acceso a la contabilidad de cada club. Con hash no se puede usar.
- **Cuentas Express o Custom de Connect**: harían a la plataforma responsable del alta, los pagos y las disputas de cada club. Con Standard la cuenta es del club, con su panel de Stripe.
- **OAuth de Connect**: Stripe recomienda Account Links para cuentas nuevas, y los clubes de hoy no tienen cuenta previa.
- **Facturar a nombre del deportista**: paga la familia, y un menor no es quien recibe la factura.
- **Fecha de emisión = fecha del cargo**: al enviar el histórico, rompería el orden de la serie de numeración.
- **SDK de Holded o de Stripe**: añadir dependencias y peso al bundle por llamadas REST sencillas, contra el patrón de Resend y Stripe (ADR 0031).
