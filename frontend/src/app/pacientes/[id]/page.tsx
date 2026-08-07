"use client";

import { useParams, useRouter } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { FichaHeader } from "@/components/patient/FichaHeader";
import { FichaTabNav } from "@/components/patient/FichaTabNav";
import { HistoriaTab } from "@/components/patient/tabs/HistoriaTab";
import { EvaluacionTab } from "@/components/patient/tabs/EvaluacionTab";
import { SeguimientoTab } from "@/components/patient/tabs/SeguimientoTab";
import { FichaPageErrorBoundary } from "@/components/patient/FichaPageErrorBoundary";
import { useFichaClinica } from "@/components/patient/hooks/useFichaClinica";
import { resolvePacienteIdFromRoute } from "@/lib/pacienteRoutes";

/**
 * Ficha clínica — un solo scroll de documento (como lista pacientes / caja).
 * Sin sub-scroll ni chrome pin: evita barra vertical anidada y “panel atrapado”.
 */
export default function FichaClinicaPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = resolvePacienteIdFromRoute(params?.id);
  const f = useFichaClinica(patientId);

  if (f.loading) {
    return (
      <PageContainer width="wide" className="!space-y-4">
        <div className="skeleton h-10 w-64 rounded-lg" />
        <div className="skeleton h-48 rounded-card" />
        <div className="skeleton h-48 rounded-card" />
      </PageContainer>
    );
  }
  if (f.error && !f.patient) {
    return (
      <PageContainer width="wide">
        <p className="text-danger-600">{f.error}</p>
      </PageContainer>
    );
  }
  if (!f.patient || !f.record) {
    return (
      <PageContainer width="wide">
        <p className="text-slate-400">No se encontró el paciente</p>
      </PageContainer>
    );
  }

  return (
    <FichaPageErrorBoundary title="Error en la ficha clínica">
      <PageContainer width="wide" className="!space-y-5">
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

        <FichaTabNav activeTab={f.fichaTab} onTabChange={f.setFichaTab} />

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
      </PageContainer>
    </FichaPageErrorBoundary>
  );
}
