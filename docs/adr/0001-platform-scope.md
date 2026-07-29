# ADR 0001: Plattformscope und modularer Monolith

Status: **ACCEPTED**

## Context
Alle Omnixys-Produkte benötigen gemeinsame Business-Analytics, Regeln, Alerts,
Data Quality und Insights. Verteilte Services würden die frühe Konsistenz und
Liefergeschwindigkeit verschlechtern.

## Decision
Wir bauen die fachliche Analytics & Insights Platform als modularen
NestJS-Monolithen. Module kommunizieren über Application Ports und
versionierte Kafka-Ereignisse.

## Alternatives
Ein reiner Tracking-Service ist fachlich zu eng. Separate Microservices ab Tag
eins erhöhen Betriebs- und Konsistenzkosten.

## Consequences
Transaktionen und Releases bleiben einfach; Modulgrenzen müssen dafür
automatisiert geprüft werden. Einzelne Module können später extrahiert werden.

## Security
Authentisierung, Autorisierung und Tenant-Isolation gelten an jedem Modulport.

## Migration and review trigger
Ein Modul wird extrahiert, wenn es unabhängig skaliert werden muss oder über
drei Monate mehr als 40 % der Plattformlast verursacht.
