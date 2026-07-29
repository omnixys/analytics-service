import type {
  AnalyticsDomainEventName,
  AnalyticsProducer,
} from "@omnixys/contracts/analytics";
import { KafkaTopics, type KafkaEventRegistry } from "@omnixys/kafka";

export interface DomainEventMapping {
  readonly topic: string;
  readonly eventVersion: "1";
  readonly producer: AnalyticsProducer;
  readonly canonicalName: AnalyticsDomainEventName;
  readonly propertyAllowlist: readonly string[];
}

const COMMON_PROPERTIES = [
  "addressId",
  "attemptId",
  "channel",
  "changedFieldCount",
  "conversationId",
  "deliveryId",
  "direction",
  "eventId",
  "hasGate",
  "hasInvitation",
  "hasSeat",
  "invitationId",
  "method",
  "notificationId",
  "profileSection",
  "provider",
  "reason",
  "reasonCode",
  "seatId",
  "status",
  "templateId",
  "ticketId",
  "verdict",
  "workspace",
] as const;

function mapping(
  topic: string,
  producer: AnalyticsProducer,
  canonicalName: AnalyticsDomainEventName,
): DomainEventMapping {
  return {
    topic,
    eventVersion: "1",
    producer,
    canonicalName,
    propertyAllowlist: COMMON_PROPERTIES,
  };
}

export const DOMAIN_EVENT_MAPPINGS = [
  mapping(KafkaTopics.address.createdFact, "address", "AddressCreated"),
  mapping(KafkaTopics.address.updatedFact, "address", "AddressUpdated"),
  mapping(KafkaTopics.address.deletedFact, "address", "AddressDeleted"),
  mapping(
    KafkaTopics.authentication.loginSucceededFact,
    "authentication",
    "LoginSucceeded",
  ),
  mapping(
    KafkaTopics.authentication.loginFailedFact,
    "authentication",
    "LoginFailed",
  ),
  mapping(
    KafkaTopics.authentication.logoutSucceededFact,
    "authentication",
    "LogoutSucceeded",
  ),
  mapping(
    KafkaTopics.authentication.emailVerifiedFact,
    "authentication",
    "EmailVerified",
  ),
  mapping(
    KafkaTopics.authentication.phoneVerifiedFact,
    "authentication",
    "PhoneVerified",
  ),
  mapping(KafkaTopics.conversation.createdFact, "chat", "ConversationCreated"),
  mapping(KafkaTopics.conversation.messageSentFact, "chat", "MessageSent"),
  mapping(KafkaTopics.conversation.closedFact, "chat", "ConversationClosed"),
  mapping(
    KafkaTopics.communication.deliverySucceededFact,
    "communication-gateway",
    "MessageDeliverySucceeded",
  ),
  mapping(
    KafkaTopics.communication.deliveryFailedFact,
    "communication-gateway",
    "MessageDeliveryFailed",
  ),
  mapping(KafkaTopics.event.createdFact, "event", "EventCreated"),
  mapping(KafkaTopics.event.updatedFact, "event", "EventUpdated"),
  mapping(KafkaTopics.event.activatedFact, "event", "EventActivated"),
  mapping(KafkaTopics.event.deactivatedFact, "event", "EventDeactivated"),
  mapping(KafkaTopics.event.deletedFact, "event", "EventDeleted"),
  mapping(KafkaTopics.invitation.createdFact, "invitation", "InvitationCreated"),
  mapping(
    KafkaTopics.invitation.acceptedFact,
    "invitation",
    "InvitationAccepted",
  ),
  mapping(
    KafkaTopics.invitation.declinedFact,
    "invitation",
    "InvitationDeclined",
  ),
  mapping(KafkaTopics.invitation.expiredFact, "invitation", "InvitationExpired"),
  mapping(
    KafkaTopics.invitation.rsvpSubmittedFact,
    "invitation",
    "RsvpSubmitted",
  ),
  mapping(
    KafkaTopics.invitation.rsvpUpdatedFact,
    "invitation",
    "RsvpUpdated",
  ),
  mapping(
    KafkaTopics.notification.deliveredFact,
    "notification",
    "NotificationDelivered",
  ),
  mapping(
    KafkaTopics.notification.failedFact,
    "notification",
    "NotificationFailed",
  ),
  mapping(KafkaTopics.seat.assignedFact, "seat", "SeatAssigned"),
  mapping(KafkaTopics.seat.changedFact, "seat", "SeatChanged"),
  mapping(KafkaTopics.seat.unassignedFact, "seat", "SeatUnassigned"),
  mapping(KafkaTopics.ticket.generatedFact, "ticket", "TicketGenerated"),
  mapping(KafkaTopics.ticket.revokedFact, "ticket", "TicketRevoked"),
  mapping(KafkaTopics.ticket.scanSucceededFact, "ticket", "QrScanSucceeded"),
  mapping(KafkaTopics.ticket.scanRejectedFact, "ticket", "QrScanRejected"),
  mapping(KafkaTopics.ticket.guestCheckedInFact, "ticket", "GuestCheckedIn"),
  mapping(KafkaTopics.ticket.guestCheckedOutFact, "ticket", "GuestCheckedOut"),
  mapping(KafkaTopics.user.profileUpdatedFact, "user", "ProfileUpdated"),
] as const satisfies readonly DomainEventMapping[];

export const DOMAIN_EVENT_TOPICS = DOMAIN_EVENT_MAPPINGS.map(
  ({ topic }) => topic,
) as Array<keyof KafkaEventRegistry>;

export function domainEventMapping(
  topic: string,
  eventVersion: string,
): DomainEventMapping | undefined {
  return DOMAIN_EVENT_MAPPINGS.find(
    (entry) =>
      entry.topic === topic && entry.eventVersion === eventVersion,
  );
}

export function allowedProperties(
  mapping: DomainEventMapping,
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = new Set(mapping.propertyAllowlist);
  return Object.fromEntries(
    Object.entries(properties).filter(([key]) => allowed.has(key)),
  );
}
