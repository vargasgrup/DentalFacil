"use client";

import { useParams, useRouter } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { FichaHeader } from "@/components/patient/FichaHeader";
import { FichaTabNav } from "@/components/patient/FichaTabNav";
import { HistoriaTab } from "@/components/patient/tabs/HistoriaTab";
import { EvaluacionTab } from "@/components/patient/tabs/EvaluacionTab";
import { SeguimientoTab } from "@/components/patient/tabs/SeguimientoTab";
import { useFichaClinica } from "@/components/patient/hooks/useFichaClinica";
import { resolvePacienteIdFromRoute } from "@/lib/pacienteRoutes";

export default function FichaClinicaPage() {
  const params = useParams();
  const router = useRouter();
  // Static export only embeds id="_"; real UUID comes from the browser URL.
  const patientId = resolvePacienteIdFromRoute(params?.id);
  const f = useFichaClinica(patientId);

  if (f.loading) {
    return (
      <div className="app-page-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">
        <div className="skeleton h-10 w-64 rounded-lg" />
        <div className="skeleton h-48 rounded-card" />
        <div className="skeleton h-48 rounded-card" />
      </div>
    );
  }
  if (f.error && !f.patient) {
    return (
      <p className="app-page-scroll min-h-0 flex-1 overflow-y-auto text-danger-600">
        {f.error}
      </p>
    );
  }
  if (!f.patient || !f.record) {
    return (
      <p className="app-page-scroll min-h-0 flex-1 overflow-y-auto text-slate-400">
        No se encontró el paciente
      </p>
    );
  }

  return (
    <PageContainer width="wide" layout="split" className="!space-y-0">
      {/* Nombre / breadcrumb: fijo bajo el topbar (mismo contrato que chrome) */}
      <div className="shrink-0 space-y-3 pb-3">
        <FichaHeader
          patient={f.patient}
          onBack={() => router.push("/pacientes")}
          onPatientUpdated={f.applyPatientUpdate}
        />

        {f.error && (
          <div className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-600">
            {f.error}
          </div>
        )}
      </div>

      {/* Tabs: FUERA del scroll — no se mueven con la rueda del mouse */}
      <FichaTabNav activeTab={f.fichaTab} onTabChange={f.setFichaTab} />

      {/* Único scrollport de la ficha: solo el panel activo */}
      <div className="app-page-scroll min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pt-4">
        {f.fichaTab === "historia" && (
          <HistoriaTab
            patient={f.patient}
            patientId={patientId}
            patientForm={f.patientForm}
            setPatientForm={f.setPatientForm}
            recordForm={f.recordForm}
            setRecordForm={f.setRecordForm}
            edad={f.edad}
            allergyTags={f.allergyTags}
            allergyInput={f.allergyInput}
            setAllergyInput={f.setAllergyInput}
            addAllergyTag={f.addAllergyTag}
            removeAllergyTag={f.removeAllergyTag}
            habitos={f.habitos}
            odonNotes={f.odonNotes}
            setOdonNotes={f.setOdonNotes}
            toggleHabito={f.toggleHabito}
            savePatient={f.savePatient}
            saveRecord={f.saveRecord}
            patientSaved={f.patientSaved}
            recordSaved={f.recordSaved}
            onAgendarCita={() => router.push(`/agenda?patient_id=${patientId}`)}
          />
        )}

        {f.fichaTab === "evaluacion" && (
          <EvaluacionTab
            patient={f.patient}
            patientId={patientId}
            record={f.record}
            recordForm={f.recordForm}
            setRecordForm={f.setRecordForm}
            planBundle={f.planBundle}
            setPlanBundle={f.setPlanBundle}
            planItems={f.planItems}
            setPlanItems={f.setPlanItems}
            planTotals={f.planTotals}
            hasOdontogramSnapshot={f.hasOdontogramSnapshot}
            consentText={f.consentText}
            doctorDisplay={f.doctorDisplay}
            saveRecord={f.saveRecord}
            recordSaved={f.recordSaved}
            toggleConsentimiento={f.toggleConsentimiento}
            addPlanFromOdontogram={f.addPlanFromOdontogram}
            addItemRow={f.addItemRow}
            removeItemRow={f.removeItemRow}
            updateItem={f.updateItem}
            registerPlanItemInEvolution={f.registerPlanItemInEvolution}
          />
        )}

        {f.fichaTab === "seguimiento" && (
          <SeguimientoTab
            patient={f.patient}
            patientId={patientId}
            record={f.record}
            planBundle={f.planBundle}
            evolution={f.evolution}
            financial={f.financial}
            payments={f.payments}
            evoTotals={f.evoTotals}
            estadoColors={f.estadoColors}
            showEvoForm={f.showEvoForm}
            setShowEvoForm={f.setShowEvoForm}
            newEvo={f.newEvo}
            setNewEvo={f.setNewEvo}
            addEvolution={f.addEvolution}
            deleteEvolution={f.deleteEvolution}
            updateEvolutionEstado={f.updateEvolutionEstado}
            updateEvolutionField={f.updateEvolutionField}
            saveRecord={f.saveRecord}
            onNavigate={(path) => router.push(path)}
          />
        )}
      </div>
    </PageContainer>
  );
}
