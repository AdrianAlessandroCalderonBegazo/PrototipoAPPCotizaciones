/** Error con el mensaje ya escrito para la persona y el código HTTP. `datos` va junto al mensaje en la respuesta. */
export class ErrorApi extends Error {
  constructor(codigo, mensaje, datos = null) {
    super(mensaje);
    this.codigo = codigo;
    this.datos = datos;
  }
}

export const falla = (codigo, mensaje, datos = null) => new ErrorApi(codigo, mensaje, datos);
