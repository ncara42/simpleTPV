# Manual de usuario — Piloto simpleTPV

> **A quién va dirigido este documento**
>
> - **Dependientes y responsables de tienda**: secciones 1, 2 y 4.
> - **Encargado/a y administración**: secciones 1, 3 y 4.
> - **Equipo técnico del piloto**: sección 5 (checklist de arranque).
>
> **Nota sobre los datos**: en producción la app trabaja con datos reales de tu organización.
> No hay modo demo ni datos de prueba precargados.

---

## 1. Qué es simpleTPV

simpleTPV consta de **dos aplicaciones**:

| App                      | Quién la usa                 | Para qué                                |
| ------------------------ | ---------------------------- | --------------------------------------- |
| **TPV** (punto de venta) | Dependiente en mostrador     | Cobrar, gestionar caja, fichar          |
| **Backoffice**           | Encargado/a y administración | Catálogo, stock, ventas, usuarios, etc. |

Cada una tiene su propia URL. El selector de la barra superior permite saltar de una a otra.

---

## 2. Manual del TPV (para dependientes)

### 2.1 Iniciar sesión

1. Abre la URL del TPV en el navegador.
2. Introduce tu **correo** y tu **contraseña** en los campos del formulario de acceso.
3. Pulsa **Iniciar sesión**.
4. Al entrar verás directamente la pantalla de venta con la cuadrícula de productos.

Para cerrar sesión: pulsa el **menú de cuenta** (parte inferior del sidebar) y elige **Cerrar sesión**.

---

### 2.2 Pantalla de venta: buscar un producto

El campo de búsqueda está activo por defecto al entrar en la pantalla de venta.

**Búsqueda por nombre:**

1. Escribe el nombre o parte del nombre del producto en el campo de búsqueda.
2. La cuadrícula se filtra en tiempo real mientras tecleas (hay un pequeño retardo de ~200 ms).
3. Pulsa sobre la tarjeta del producto para añadirlo al carrito.

**Limpiar la búsqueda:** borra el texto del campo; la cuadrícula muestra de nuevo todos los productos.

---

### 2.3 Escanear un código de barras

El lector de códigos de barras funciona como si teclease en el campo de búsqueda.

1. Asegúrate de que el campo de búsqueda tiene el foco (al entrar ya lo tiene por defecto).
2. Apunta el lector al código del producto y escanea.
3. El lector envía el código seguido de un **Intro** automático.
4. Si el código existe, aparece un banner de confirmación con el nombre del producto y la línea se añade al carrito. El campo queda vacío listo para el siguiente escaneo.
5. Si el código no corresponde a ningún producto, el banner avisa de "sin producto" y el carrito no cambia.

---

### 2.4 Navegar por arquetipos (familias y subfamilias)

La barra de arquetipos aparece encima de la cuadrícula.

- El chip **Todas** (con el recuento total de productos) muestra el catálogo completo.
- Los chips con nombre de arquetipo filtran por ese nivel. Si un arquetipo tiene subniveles, al pulsarlo se despliega un selector; elige **Todo · [Nombre]** para ver todos los productos de ese árbol, o un subnivel concreto para acotar más.
- Para volver a ver todo el catálogo, pulsa de nuevo el chip **Todas**.

---

### 2.5 Productos con stock a cero

Los productos sin stock aparecen **atenuados** al final de la cuadrícula y muestran **0** en su contador de stock. Puedes seguir pulsando sobre ellos para añadirlos al carrito; la venta no se bloquea por falta de stock.

---

### 2.6 Carrito: añadir, ajustar cantidad y vaciar

- **Añadir**: pulsa una tarjeta de producto o escanea su código. Cada pulsación añade una unidad; si el producto ya está en el carrito, la cantidad aumenta.
- **Ajustar cantidad**: en la línea del carrito puedes editar directamente el campo de cantidad.
- **Vaciar todo**: pulsa el botón **Vaciar** del carrito. El carrito quedará vacío.

---

### 2.7 Descuento manual en una línea

1. Con al menos una línea en el carrito, pulsa el botón de **Descuento** (parte inferior del carrito).
2. Se abre el modal de descuento. Por defecto trabaja sobre la primera línea.
3. Elige el modo **Importe fijo** (campo para introducir euros) o el tipo que esté disponible.
4. Escribe el valor del descuento y pulsa **Aplicar**.
5. El modal se cierra. En el carrito aparece el importe descontado tachado y el total recalculado.
6. Para **quitar el descuento**: pulsa el botón **Quitar** que aparece junto al importe de descuento.

---

### 2.8 Cobrar (efectivo) y confirmar la venta

La caja debe estar abierta para que el botón de cobro esté activo (ver sección 2.10).

1. Comprueba que el total del carrito es correcto.
2. Pulsa el botón **Cobrar**.
3. Se abre el modal de pago. Selecciona **Efectivo**.
4. Introduce el importe que entrega el cliente en el campo **Efectivo entregado**.
5. Pulsa **Confirmar**.
6. Aparece el banner **Venta registrada** y el carrito queda vacío listo para la siguiente venta.

---

### 2.9 Tickets y devoluciones

El sidebar incluye la vista **Tickets emitidos** (icono de historial).

**Ver un ticket:**

1. Pulsa **Tickets** en el sidebar.
2. Usa el buscador (por número de ticket, importe, vendedor o producto) o los filtros de estado y método de pago.
3. Pulsa sobre una fila para ver el detalle del ticket.

**Reimprimir un ticket:**

- En el detalle del ticket, pulsa **Reimprimir**.

**Gestionar una devolución:**

1. Abre el detalle del ticket (solo funciona en tickets con estado **Completado**).
2. Pulsa **Gestionar devolución**.
3. Para cada línea, introduce la cantidad a devolver.
4. Escribe el **Motivo de devolución** (obligatorio).
5. Pulsa **Confirmar devolución**.

---

### 2.10 Caja: abrir turno y cerrar caja

Accede a la vista de caja pulsando **Caja** en el sidebar.

**Abrir la caja (inicio de turno):**

1. Si la caja está cerrada, verás el formulario de apertura con el mensaje "Ábrela para empezar a cobrar este turno."
2. Introduce el **Efectivo inicial (€)** — el importe que hay en caja al empezar el turno.
3. Pulsa **Abrir caja**.
4. La caja pasa a estado **Caja abierta** y ya puedes cobrar desde la pantalla de venta.

**Cerrar la caja (fin de turno):**

1. En la vista de Caja (estado **Caja abierta**), pulsa **Cerrar caja**.
2. Aparece el contador de denominaciones. Cuenta el efectivo físico que tienes e introduce las cantidades por denominación (p. ej. número de billetes de 50 €, de 20 €, etc.).
3. El total contado se actualiza en tiempo real al pie del contador.
4. Pulsa **Confirmar** para cerrar. Aparece un resumen del cuadre con el importe contado.
5. Si quieres interrumpir el conteo sin cerrar, pulsa **Cancelar**; el conteo queda guardado para retomarlo después.

---

### 2.11 Fichaje: entrada, pausa y salida

Accede al control horario pulsando **Fichaje** en el sidebar.

**Fichar entrada:**

1. El estado inicial es **Sin fichaje activo**.
2. Pulsa **Fichar entrada**.
3. Se abre un modal de confirmación. Pulsa **Confirmar** para registrar la entrada (o **Cancelar** si fue un error).
4. El estado cambia a **Fichado** y aparece un contador de tiempo en el panel y en el elemento del sidebar.

**Iniciar pausa:**

1. Con estado **Fichado**, pulsa **Iniciar pausa**.
2. El estado cambia a **En pausa**.

**Terminar pausa:**

1. Con estado **En pausa**, pulsa **Terminar pausa**.
2. Vuelves a estado **Fichado**.

**Fichar salida:**

1. Con estado **Fichado**, pulsa **Fichar salida**.
2. Se abre el modal de confirmación. Pulsa **Confirmar**.
3. El estado vuelve a **Sin fichaje activo** y el contador del sidebar desaparece.

**Ver historial de jornadas:**

- La tabla inferior muestra tus jornadas. Puedes filtrar por fecha usando el campo de fecha; pulsa el botón de limpiar para ver todas de nuevo.

---

## 3. Manual del backoffice (para encargado/a y administración)

Accede al backoffice en la URL correspondiente e inicia sesión con tu cuenta de administrador o responsable.

---

### 3.1 Roles y permisos

| Rol       | Etiqueta en la app | Acceso                                                                    |
| --------- | ------------------ | ------------------------------------------------------------------------- |
| `ADMIN`   | Admin              | Todo el backoffice sin restricciones                                      |
| `MANAGER` | Responsable        | Gestión de su tienda (pendiente de confirmar el alcance exacto por vista) |
| `CLERK`   | Dependiente        | Solo puede usar el TPV; no accede al backoffice                           |

Los usuarios con rol **Dependiente** que intenten acceder al backoffice verán la pantalla de acceso denegado.

Para cambiar el rol de un usuario, ve a **Usuarios** (sección 3.9).

---

### 3.2 Dashboard

Vista de inicio del backoffice. Muestra:

- **7 tarjetas KPI**: ventas de hoy, ticket medio, unidades por ticket, margen, beneficio, descuento medio y devoluciones.
- **Selector de periodo** (Hoy / Semana / etc.).
- **Gráficas**: barras de ventas, distribución por arquetipo, roturas de stock, rankings, ventas por hora, descuento por empleado, rotación de producto (por arquetipo o por producto).

**Personalizar el dashboard**: pulsa el botón de personalización para ocultar o mostrar tarjetas KPI. La configuración persiste entre sesiones.

---

### 3.3 Ventas

Lista completa de ventas con filtros, paginación y exportación.

- **Filtros disponibles**: vendedor/a, estado (Completada / Anulada), y otros.
- **Columnas configurables**: pulsa el icono de columnas para ocultar o mostrar columnas. La configuración persiste.
- **Guardar vista**: filtra como necesites y pulsa **Guardar vista** para crear un acceso rápido reutilizable que aparece como chip.
- **Limpiar**: borra todos los filtros y vuelve a la primera página.

---

### 3.4 Catálogo

Gestión de productos.

- La tabla muestra todos los productos con su ruta de arquetipo (p. ej. `Flores › Índica`).
- **Nuevo producto**: pulsa el botón y rellena el formulario. El selector de arquetipo es jerárquico: elige directamente el nivel que quieras.
- **Edición en lote**: marca varios productos con la casilla de selección y pulsa **Editar (n)**. El asistente recorre los productos seleccionados de uno en uno con botones **Siguiente (n / total)** y **Guardar (n / total)**.

---

### 3.5 Arquetipos (familias)

Organización jerárquica del catálogo.

- La tabla muestra los arquetipos raíz con sus subniveles anidados y el número de productos en cada uno.
- **Crear subnivel**: selecciona un arquetipo y pulsa **+ Hija** para añadir un subnivel con profundidad arbitraria.
- **Reordenar**: arrastra una fila raíz a la posición deseada.

---

### 3.6 Stock

Vista global del stock por producto y tienda.

- La tabla muestra filas de producto con badges por tienda.
- **Filtro por rotación**: filtra entre rotación alta, media o baja.
- Desde la vista de **Tiendas**, el acceso directo **Stock** en cada tarjeta lleva directamente a la página de stock filtrada por esa tienda.

---

### 3.7 Traspasos

Movimientos de stock entre tiendas.

- Para crear un traspaso, pulsa **Nuevo traspaso**.
- En el formulario, elige la **tienda origen**, el **producto** y la **cantidad**. El campo de tienda destino también está disponible.
- Una vez creado, el traspaso queda registrado en la lista.

---

### 3.8 Tiendas

Vista en cuadrícula con todas las tiendas de la organización.

- Cada tarjeta muestra el nombre de la tienda, ventas del día, estado operativo (**Abierta** / **Cerrada**) y accesos directos.
- **Acceso directo Stock**: lleva directamente a la página de stock de esa tienda.
- **Detalle de tienda**: pulsa sobre la tarjeta para ver el detalle, el estado operativo y el registro de fichajes (icono de registro → drawer lateral con tabla de fichajes).
- **Autorizar dispositivo**: si un dispositivo aparece como "sin verificar", pulsa **Autorizar** y luego **Generar token** para obtener el código de fichaje (`FICHA-…`) que hay que introducir en el dispositivo.

---

### 3.9 Usuarios y permisos

Gestión de las cuentas de acceso.

- La tabla muestra todos los usuarios con su badge de rol (**Admin** / **Responsable** / **Dependiente**).
- **Crear usuario**: pulsa **Nuevo usuario** e introduce nombre, correo, contraseña y rol.
- **Editar**: marca uno o varios usuarios y pulsa **Editar (n)** para modificar nombre, rol y tiendas asignadas. En edición en lote, avanza con **Siguiente** y confirma con **Guardar**.
- Los usuarios con rol **Admin** tienen acceso a todas las tiendas automáticamente. Los roles **Responsable** y **Dependiente** requieren asignarles tiendas concretas.

---

### 3.10 Control horario (backoffice)

Vista de todos los fichajes de la organización.

- La tabla muestra las jornadas con empleado, fecha, entradas, salidas y totales.
- **Filtrar por empleado**: usa el selector para ver solo las jornadas de una persona.
- **Limpiar**: vuelve a mostrar todas las jornadas.

---

### 3.11 Promociones

Gestión de descuentos y promociones automáticas.

- Las promociones se agrupan en tres estados: **Activa**, **Programada** e **Inactiva**. Los chips de grupo permiten filtrar.
- **Nueva promoción**: pulsa **Nueva** y usa el constructor de reglas; la previsualización del impacto se actualiza en tiempo real.
- Una vez guardada aparece en la lista con su nombre.

---

### 3.12 Mayorista (B2B)

Gestión de clientes mayoristas, tarifas y pedidos. La vista tiene tres sub-pestañas:

**Clientes**: lista de clientes B2B. Pulsa **Nuevo cliente**, introduce el nombre y guarda.

**Tarifas**: lista de tarifas. Pulsa **Precios** en una tarifa para ver su detalle de precios por producto.

**Pedidos**: lista de pedidos mayoristas. Pulsa **Nuevo pedido**, elige cliente y líneas de producto, y guarda. El precio de cada línea se toma de la tarifa del cliente.

Para **borrar** un cliente o elemento, el sistema pide confirmación mediante un diálogo; acepta para confirmar. Aparece un mensaje de confirmación en la esquina de la pantalla.

---

### 3.13 API Keys

Claves de acceso externo de solo lectura (para integraciones con ERP, sistemas de terceros, etc.).

- Pulsa **Nueva key**, introduce un nombre y pulsa **Crear**.
- La clave completa se muestra **una sola vez** en el banner. Cópiala y guárdala en un lugar seguro; no volverá a mostrarse.
- Las claves aparecen listadas en la tabla y son revocables.

---

### 3.14 Ayuda

Canales de soporte (WhatsApp, correo electrónico y teléfono) y preguntas frecuentes en acordeón.

Horario de soporte: **L-V de 9:00 a 19:00**.

---

## 4. FAQ — Resolución de problemas frecuentes

### "No puedo iniciar sesión"

- Comprueba que el correo no tiene espacios antes o después.
- Prueba con la contraseña que te dio el administrador. Si no la recuerdas, pídele al administrador que te la cambie desde **Usuarios** en el backoffice.
- Si el error persiste, contacta con soporte (ver sección 3.14 del backoffice).

---

### "No aparece ningún producto en el TPV"

En producción esto significa que el catálogo no tiene productos dados de alta o que la tienda no tiene stock cargado, no que sea un entorno de prueba.

- Pide al encargado/a que compruebe en **Catálogo** del backoffice que hay productos activos.
- Comprueba también que en **Stock** hay existencias asignadas a tu tienda.
- Si el problema es de conexión (pantalla de carga indefinida), comprueba la red y avisa al técnico.

---

### "El lector de códigos no añade nada al carrito"

1. Comprueba que el campo de búsqueda tiene el foco (haz clic sobre él si no lo tiene).
2. Escanea de nuevo. El banner confirmará si el producto se encontró o si el código no existe.
3. Si el código no existe, el producto puede no tener código de barras asignado. El encargado/a puede añadirlo desde **Catálogo**.
4. Comprueba que el lector está configurado para enviar un **Intro** al final (la mayoría lo hacen por defecto; consulta el manual del lector si no).

---

### "La caja no cuadra al cerrar"

- Repasa el conteo de denominaciones físicas antes de confirmar.
- Si confirmaste un cierre incorrecto, avisa al encargado/a para que lo revise en **Ventas** del backoffice, donde están los tickets del turno.
- El resumen de cuadre que aparece al confirmar el cierre muestra el importe contado.

---

### "¿Cómo hago una devolución?"

Las devoluciones se gestionan desde la vista **Tickets** del TPV:

1. Busca el ticket original (por número, importe, vendedor o producto).
2. Entra en el detalle del ticket.
3. Pulsa **Gestionar devolución**.
4. Introduce la cantidad a devolver en cada línea y escribe el motivo.
5. Pulsa **Confirmar devolución**.

Solo es posible si el ticket está en estado **Completado**. Los tickets **Anulados** no admiten devolución.

---

### "Olvidé fichar / me equivoqué al fichar"

El sistema no permite editar fichajes desde el TPV. Avisa al encargado/a para que lo corrija o lo anote. El administrador puede consultar el historial en **Control horario** del backoffice.

---

### "Un dependiente no ve una tienda o una opción que debería ver"

- Los usuarios con rol **Dependiente** solo acceden al TPV, no al backoffice. Si necesitan acceso al backoffice, el administrador debe cambiarles el rol a **Responsable** o **Admin** desde **Usuarios**.
- En el TPV, el dependiente solo ve los productos y el stock de la tienda a la que está asignado. Si no aparece la tienda correcta, el administrador debe asignarle esa tienda en **Usuarios**.
- Si un dependiente ve datos de otra tienda que no debería ver, avisa de inmediato al administrador: puede ser un problema de configuración de permisos.

---

### "El botón 'Cobrar' está desactivado"

La caja debe estar abierta antes de poder cobrar. Ve a la vista **Caja** en el sidebar y abre la caja siguiendo los pasos de la sección 2.10.

---

## 5. Checklist de arranque del piloto

Antes de poner el TPV en producción con personal real, verifica estos puntos. Para los pasos de despliegue técnico, consulta [`docs/deployment.md`](./deployment.md). Para el proceso de carga de datos y el checklist físico de tienda, consulta [`docs/staging-formacion.md`](./staging-formacion.md).

**Infraestructura**

- [ ] Aplicaciones desplegadas y migraciones de base de datos ejecutadas (`prisma migrate deploy`).
- [ ] Contraseñas del rol `app` de base de datos aplicadas (ver `docs/deployment.md`; **no están en las migraciones**).
- [ ] Variables de entorno de producción configuradas (sin valores de placeholder).
- [ ] API respondiendo en `:3001` y frontends accesibles en sus URLs definitivas.

**Datos iniciales**

- [ ] Catálogo cargado (productos, arquetipos, precios de venta).
- [ ] Stock inicial de cada tienda introducido.
- [ ] Tiendas creadas y dispositivos autorizados (token de fichaje generado y configurado en cada terminal).
- [ ] Usuarios creados con el rol correcto y asignados a su tienda.

**Verificación funcional**

- [ ] Login real verificado con credenciales de producción (no credenciales demo).
- [ ] Venta completa probada: buscar producto → añadir al carrito → cobrar → confirmar.
- [ ] Apertura y cierre de caja probados.
- [ ] Fichaje de entrada y salida probados en el terminal.

**Hardware**

- [ ] Impresora de tickets configurada y probada (reimprimir un ticket de prueba).
- [ ] Lector de códigos de barras probado (escanear un producto real y verificar que se añade al carrito).

**Formación**

- [ ] Dependientes formados en las secciones 2.1–2.11 de este manual.
- [ ] Encargado/a formado/a en las secciones 3.1–3.14 de este manual.
- [ ] Canal de soporte comunicado al personal (ver backoffice → Ayuda).
