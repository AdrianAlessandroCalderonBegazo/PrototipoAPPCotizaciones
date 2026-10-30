-- ERP · Fase 7: la IA también responde en la app de Finanzas (consultas sobre la caja diaria y la caja chica).
-- Sus conversaciones son privadas de cada persona, como las del Asistente.
ALTER TABLE ia_conversaciones DROP CONSTRAINT IF EXISTS ia_conversaciones_modulo_check;
ALTER TABLE ia_conversaciones ADD CONSTRAINT ia_conversaciones_modulo_check CHECK (modulo IN ('cotizador', 'asistente', 'finanzas'));
