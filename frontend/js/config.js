/**
 * Configuración global de la aplicación: URL del backend y opciones S1CODIMA (código y etiqueta).
 */
window.APP_CONFIG = {
  BACKEND_BASE: "http://127.0.0.1:8000",
  MEDIHELP_BASE: "http://172.16.2.51:8070/Medihelp-api",
  S1CODIMA_OPTIONS: [
    { value: "1", label: "1 - RECORD DE ANESTESIA" },
    { value: "2", label: "2 - RESULTADO ESTUDIO" },
    { value: "3", label: "3 - CONSENTIMIENTO INFORMADO" },
    { value: "4", label: "4 - REGISTRO REC. POST ANESTESIA" },
    { value: "5", label: "5 - HOJA MEDICAMENTOS CIRUGIA" },
    { value: "6", label: "6 - HOJA GASTO MAT OSTEOSINTESIS" },
    { value: "8", label: "8 - TRASLADO DE AMBULANCIA" },
    { value: "9", label: "9 - CONSENTIMIENTO DE ENFERMERIA" },
    { value: "10", label: "10 - CONSENTIMIENTO DE ANESTESIA" },
    { value: "11", label: "11 - CONSENTIMIENTO DE APOYO DIAG" },
    { value: "12", label: "12 - ORDENES MEDICAS" },
    { value: "13", label: "13 - EVOLUCION MEDICA" },
    { value: "14", label: "14 - NOTAS DE ENFERMERIA" },
    { value: "15", label: "15 - EGRESO DE PACIENTE (LV)" },
    { value: "16", label: "16 - REPORTE ESTUDIO DE IMAGENES" },
    { value: "17", label: "17 - RESERVAS DE COMPONENTES SANGUI" },
  ],
};
