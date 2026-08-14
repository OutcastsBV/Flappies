{{/*
Base name for all resources.
*/}}
{{- define "flappies.fullname" -}}
{{- .Release.Name -}}
{{- end -}}

{{/*
Common labels applied to every resource.
*/}}
{{- define "flappies.labels" -}}
app.kubernetes.io/part-of: flappies
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end -}}

{{/*
Selector labels for a given component (e.g. api, frontend, zitadel, postgres-app).
*/}}
{{- define "flappies.selectorLabels" -}}
app.kubernetes.io/name: flappies
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{/*
Name of the Secret holding all Flappies credentials.
*/}}
{{- define "flappies.secretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{ .Values.secrets.existingSecret }}
{{- else -}}
{{ include "flappies.fullname" . }}-secrets
{{- end -}}
{{- end -}}
