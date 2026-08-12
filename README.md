# ptitp-client-lead

Panel de seguimiento de prospectos del Parque Tecnológico Inteligente Taiwán-Paraguay.

Dos módulos separados sobre dos formularios distintos. Responde por correo desde la cuenta
del parque y deja registrado cada contacto.

**Consultas** — Cuestionario de Interés. Entrada abierta: cualquiera pregunta. Proveedores
que ofrecen servicios, gente que busca empleo, invitaciones a eventos, y también empresas
que sí quieren instalarse. El trabajo es responder y **calificar**.
Estados: Nueva → Respondida → Calificada → Formulario enviado → (Descartada).

**Solicitudes** — Inquiry / 承租詢問書. Sólo lo completa quien quiere arrendar terreno o
galpón. Cada entrada es un expediente con superficie, energía, agua, cronograma y
representante legal. El trabajo es **cotizar**.
Estados: Recibida → En evaluación → Visita agendada → Cotizada → Contrato → (Descartada).

Los dos módulos no comparten vocabulario de estados a propósito: una consulta no se
"cotiza" y una solicitud no se "califica" — ya llegó calificada. El puente entre ambos
es la única conversión que importa, y el panel la mide: **cuántas consultas terminaron
presentando una solicitud**.

```
docs/index.html        Frontend estático → GitHub Pages
apps-script/Code.gs    API: lectura de formularios, estado CRM, envío de correo con adjuntos
```

## Adjuntos

Los dos módulos comparten el mismo redactor, con dos vías de adjunto:

- **Biblioteca del parque** — los documentos que se mandan siempre (presentación, plano de
  lotes, tarifas, resumen de Maquila). Viven en una carpeta de Drive, aparecen como casillas
  y no se vuelven a subir en cada correo. Para activarla, crear la carpeta y poner su ID en
  `LIBRARY_FOLDER_ID` dentro de `Code.gs`. Sin eso el redactor funciona igual, sólo sin
  biblioteca.
- **Archivos sueltos** — arrastrar al recuadro o elegirlos del disco. Se leen a base64 en el
  navegador y viajan en el mismo POST.

El tope es 20 MB por correo (Gmail admite 25; el margen es para el encabezado y el encode).
Se valida dos veces: al agregar cada archivo y otra vez en el servidor antes de enviar.
Para algo más pesado, subirlo a Drive y mandar el enlace en el cuerpo.

El registro guarda los nombres de lo adjuntado junto al texto del correo, así queda
constancia de qué documentación recibió cada empresa.

## Fuentes

| Origen | Planilla | Estructura |
|---|---|---|
| Inquiry / 承租詢問書 | `1m2gtjC1…g_bY4` | 1 planilla, 3 pestañas (EN / ES / PT), 35 columnas |
| Cuestionario de Interés | `1FWpGlcp…qxIc` | 1 pestaña, 18 columnas |

Las tres pestañas del inquiry **no comparten orden de columnas** — en la versión inglesa
«公司網站» está al final y en las otras dos en la quinta posición. Por eso el backend
localiza cada campo por el prefijo chino del encabezado, nunca por posición.

## Puesta en marcha

1. **Crear la planilla CRM.** Una planilla nueva y vacía; copiar su ID en `CRM_ID`
   dentro de `Code.gs`. Las pestañas `CRM` y `LOG` se crean solas.
2. **Pegar `Code.gs`** en un proyecto de Apps Script de la cuenta dueña de los
   formularios (`psc.gerente9.py`). Desde otra cuenta los disparadores no se pueden crear.
3. **Definir la clave.** Configuración del proyecto › Propiedades del script ›
   `API_TOKEN` = una cadena larga y aleatoria.
4. **Ejecutar `setupTriggers()`** una vez, para autorizar y activar el aviso de nuevo prospecto.
5. **Implementar › Nueva implementación › Aplicación web**
   — Ejecutar como: *Yo* · Quién accede: *Cualquier persona*. Copiar la URL `/exec`.
6. **Publicar el frontend.** Subir el repo, activar Pages sobre la carpeta `/docs`.
7. Abrir la página, pulsar **Actualizar** y pegar URL, clave y tu nombre. Quedan
   guardados en el navegador.

Sin backend configurado la página arranca en modo demostración con datos de ejemplo:
sirve para revisar la interfaz antes de conectar nada.

## Seguridad

La aplicación web debe aceptar «cualquier persona» para que el navegador pueda
consultarla desde GitHub Pages. **La URL y la clave son la única barrera.** Quien tenga
ambas ve todos los expedientes, incluidos documentos de identidad y domicilios de los
representantes legales.

- No subir nunca la URL ni la clave al repositorio.
- Rotar `API_TOKEN` si se comparte el panel con alguien que deja de usarlo.
- Para más de un usuario habitual, conviene migrar a un backend con cuentas reales.

## Límites conocidos

- **Cuota de correo:** 100 envíos diarios en cuenta gratuita, 1.500 en Workspace.
  El backend rechaza el envío antes de agotarla.
- **Sin hilo de respuesta:** se registra lo que sale, no lo que el prospecto contesta.
  Para eso haría falta leer Gmail por `threadId`.
- **Superficie:** de los rangos del cuestionario («1001 - 3000 m²») se toma el techo.
  Es el criterio de planificación, no el dato declarado.
- **Puente entre módulos:** el emparejamiento consulta ↔ solicitud usa el dominio del
  correo corporativo o el nombre normalizado de la empresa. Los dominios genéricos
  (gmail, hotmail…) se ignoran para no producir falsos positivos. Hoy no hay ninguna
  coincidencia: ninguna de las 13 consultas pasó al inquiry.
- **Enlaces a los formularios:** completar `FORM_URL` en `docs/index.html` con las URLs
  reales de los tres formularios (ES / PT / EN). Sin eso, la plantilla "Enviar formulario"
  manda un enlace de relleno.

## Calidad de los datos de origen

Detectado en la carga inicial, conviene corregirlo en la planilla y no en el código:

- Plug Energy declaró **2.800.000 m²** en una entrada y **2.800 m²** en otra. La primera
  supera todo el catastro industrial (272.516 m²); el panel la marca en rojo.
- Un RUC quedó guardado como `1.90955E+15`. Formatear esa columna como texto.
- Varias entradas usan `1` como relleno en energía, agua, efluentes y códigos.
- En el cuestionario, una entrada trae el teléfono en los campos de cargo y de empleados.
- Cinco de trece respuestas del cuestionario no son prospectos de arrendamiento
  (un buscador de empleo, dos proveedores, una invitación a un evento estudiantil).
  El panel las etiqueta automáticamente, pero la clasificación final es manual.
