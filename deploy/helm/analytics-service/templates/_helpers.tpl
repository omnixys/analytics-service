{{- define "analytics-service.name" -}}
analytics-service
{{- end }}

{{- define "analytics-service.fullname" -}}
{{ .Release.Name }}-analytics-service
{{- end }}

{{- define "analytics-service.labels" -}}
app.kubernetes.io/name: {{ include "analytics-service.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
