import {
  AGENT_ROLES,
  EQUIPMENT_TYPES,
  type Agency,
  type AgentRole,
  type EquipmentType,
  type Shift,
} from "../../shared/catalog.ts";
import { distanceKm } from "../../shared/geo.ts";
import type { AgentInput, AttributeValue, CityDataset, Street } from "../../shared/types.ts";
import type { Random } from "../random.ts";
import { BRANDS, FIRST_NAMES, LAST_NAMES, SERIAL_PREFIX } from "./texts.ts";

type Placement = "major" | "commercial" | "any" | "center" | "poi";

const PLAN: Record<EquipmentType, { count: number; placement: Placement }> = {
  radar: { count: 34, placement: "major" },
  camera: { count: 60, placement: "commercial" },
  truck_scale: { count: 4, placement: "major" },
  smart_traffic_light: { count: 30, placement: "major" },
  automated_gate: { count: 8, placement: "poi" },
  parking_kiosk: { count: 24, placement: "center" },
  parking_enforcement_vehicle: { count: 4, placement: "center" },
  transport_vehicle: { count: 30, placement: "any" },
  e_scooter: { count: 50, placement: "commercial" },
  agent_motorcycle: { count: 14, placement: "center" },
  patrol_vehicle: { count: 18, placement: "any" },
  variable_message_sign: { count: 6, placement: "major" },
};

const MAJOR_KINDS = new Set(["trunk", "primary", "secondary"]);
const COMMERCIAL_POIS = new Set([
  "mall",
  "supermarket",
  "bank",
  "university",
  "hospital",
  "bus_station",
]);

export type EquipmentSeed = {
  type: EquipmentType;
  serialNumber: string;
  brand: string;
  model: string;
  agency: Agency;
  cep: string;
  street: string;
  reference: string;
  neighborhoodId: string;
  lat: number;
  lng: number;
  attributes: Record<string, AttributeValue>;
  installedDaysAgo: number | null;
  disabled: boolean;
};

function jitter(random: Random, value: number, meters: number): number {
  return value + random.normal(0, meters / 111_000);
}

export function createInventory(city: CityDataset, random: Random): EquipmentSeed[] {
  const commercialNeighborhoods = new Set(
    city.pois.filter((poi) => COMMERCIAL_POIS.has(poi.kind)).map((poi) => poi.neighborhoodId),
  );
  const commercialPois = city.pois.filter((poi) => COMMERCIAL_POIS.has(poi.kind));
  const majorStreets = city.streets.filter((street) => MAJOR_KINDS.has(street.kind));
  const centerStreets = city.streets.filter(
    (street) =>
      street.neighborhoodId === "centro" ||
      distanceKm([street.lng, street.lat], city.city.center) < 2.2,
  );

  const streetWeight = (placement: Placement) => (street: Street) => {
    if (placement === "commercial") {
      return (
        (commercialNeighborhoods.has(street.neighborhoodId) ? 3 : 1) *
        (street.neighborhoodId === "centro" ? 3 : 1)
      );
    }
    return 1;
  };

  const referenceFor = (street: Street, lat: number, lng: number): string => {
    const nearbyPoi = city.pois.find(
      (poi) =>
        poi.neighborhoodId === street.neighborhoodId &&
        distanceKm([poi.lng, poi.lat], [lng, lat]) < 0.5,
    );
    const roll = random.next();
    if (street.kind === "trunk" && roll < 0.6) {
      return `KM ${random.int(1, 12)}`;
    }
    if (nearbyPoi && roll < 0.45) {
      return `em frente ao ${nearbyPoi.name}`;
    }
    if (roll < 0.55) {
      return "S/N";
    }
    const number = random.int(1, 240) * 10 + random.int(0, 9);
    return roll < 0.8 ? `número ${number}` : `oposto ao número ${number}`;
  };

  const placements: Record<Placement, Street[]> = {
    major: majorStreets.length > 0 ? majorStreets : city.streets,
    commercial: city.streets,
    any: city.streets,
    center: centerStreets.length > 0 ? centerStreets : city.streets,
    poi: city.streets,
  };

  const seeds: EquipmentSeed[] = [];
  const usedSerials = new Set<string>();

  for (const [type, plan] of Object.entries(PLAN) as [
    EquipmentType,
    (typeof PLAN)[EquipmentType],
  ][]) {
    for (let index = 0; index < plan.count; index += 1) {
      let street: Street;
      let lat: number;
      let lng: number;
      if (plan.placement === "poi" && commercialPois.length > 0) {
        const poi = random.pick(commercialPois);
        street =
          city.streets
            .filter((item) => item.neighborhoodId === poi.neighborhoodId)
            .sort(
              (a, b) =>
                distanceKm([a.lng, a.lat], [poi.lng, poi.lat]) -
                distanceKm([b.lng, b.lat], [poi.lng, poi.lat]),
            )[0] ?? random.pick(city.streets);
        lat = jitter(random, poi.lat, 40);
        lng = jitter(random, poi.lng, 40);
      } else {
        street = random.weighted(placements[plan.placement], streetWeight(plan.placement));
        lat = jitter(random, street.lat, 90);
        lng = jitter(random, street.lng, 90);
      }

      const maker = random.pick(BRANDS[type]);
      let serialNumber: string;
      do {
        serialNumber = `${SERIAL_PREFIX[type]}-${random.int(2019, 2026)}-${String(random.int(1, 99_999)).padStart(5, "0")}`;
      } while (usedSerials.has(serialNumber));
      usedSerials.add(serialNumber);

      const attributes = attributesFor(type, random);
      const agency: Agency =
        type === "patrol_vehicle" && random.chance(0.45)
          ? "military_police"
          : EQUIPMENT_TYPES[type].defaultAgency;
      if (type === "patrol_vehicle") {
        attributes["prefix"] =
          `${agency === "military_police" ? "PM" : "GCM"}-${random.int(100, 999)}`;
      }

      const roll = random.next();
      seeds.push({
        type,
        serialNumber,
        brand: maker.brand,
        model: random.pick(maker.models),
        agency,
        cep: street.cep,
        street: street.name,
        reference: referenceFor(street, lat, lng),
        neighborhoodId: street.neighborhoodId,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        attributes,
        installedDaysAgo: roll < 0.05 ? null : random.int(150, 1800),
        disabled: roll >= 0.05 && roll < 0.075,
      });
    }
  }
  return seeds;
}

function plate(random: Random): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const letter = () => letters[random.int(0, letters.length - 1)];
  return `${letter()}${letter()}${letter()}${random.int(0, 9)}${letter()}${random.int(10, 99)}`;
}

function attributesFor(type: EquipmentType, random: Random): Record<string, AttributeValue> {
  switch (type) {
    case "radar": {
      const enforcement = random.weighted(
        ["speed", "red_light", "forbidden_turn", "forbidden_u_turn", "bus_lane"] as const,
        (value) =>
          ({ speed: 6, red_light: 4, forbidden_turn: 1, forbidden_u_turn: 1, bus_lane: 1 })[value],
      );
      const result: Record<string, AttributeValue> = {
        enforcement,
        lanes: random.int(1, 4),
        plateReader: random.chance(0.6),
      };
      if (enforcement === "speed") {
        result["speedLimit"] = random.pick([40, 50, 60, 70]);
      }
      return result;
    }
    case "camera":
      return {
        nightVision: random.chance(0.7),
        resolution: random.pick(["720p", "1080p", "1080p", "4k"]),
        colorMode: random.chance(0.85) ? "color" : "mono",
        ptz: random.chance(0.3),
        plateReader: random.chance(0.25),
      };
    case "truck_scale":
      return { capacity: random.pick([40, 60, 80]), weighInMotion: random.chance(0.5) };
    case "smart_traffic_light":
      return {
        phases: random.int(2, 5),
        adaptive: random.chance(0.6),
        pedestrianButton: random.chance(0.5),
      };
    case "automated_gate":
      return { access: random.pick(["tag", "ticket", "plate"]) };
    case "parking_kiosk":
      return { acceptsPix: true, acceptsCard: random.chance(0.8), spaces: random.int(20, 120) };
    case "parking_enforcement_vehicle":
      return { plate: plate(random), rangeKm: random.int(180, 320), cameras: random.int(2, 6) };
    case "transport_vehicle": {
      const service = random.weighted(["taxi", "mototaxi", "school"] as const, (value) =>
        value === "taxi" ? 5 : 3,
      );
      return {
        service,
        plate: plate(random),
        seats: service === "mototaxi" ? 1 : service === "school" ? random.int(12, 20) : 4,
        permit: `ALV-${random.int(1000, 9999)}`,
      };
    }
    case "e_scooter":
      return {
        model: random.chance(0.75) ? "shared" : "public",
        operatorName: random.pick(["VoaMob", "GiraPatinete"]),
        maxSpeed: random.pick([15, 20]),
      };
    case "agent_motorcycle":
      return { plate: plate(random), engineCc: random.pick([300, 500]) };
    case "patrol_vehicle":
      return {
        plate: plate(random),
        vehicleKind: random.pick(["car", "car", "pickup", "motorcycle"]),
        prefix: "",
      };
    case "variable_message_sign":
      return { lines: random.int(2, 3), fullColor: random.chance(0.4) };
  }
}

const SHIFT_WEIGHTS: Record<Shift, number> = { morning: 4, afternoon: 4, night: 2 };

const ROLE_PLAN: { role: AgentRole; count: number; ranks: string[] }[] = [
  { role: "traffic_agent", count: 30, ranks: ["Agente I", "Agente II", "Supervisor"] },
  {
    role: "municipal_guard",
    count: 24,
    ranks: ["Guarda 3ª classe", "Guarda 2ª classe", "Guarda 1ª classe", "Inspetor"],
  },
  { role: "military_police", count: 16, ranks: ["Soldado", "Cabo", "3º Sargento", "Tenente"] },
];

export function createAgents(
  city: CityDataset,
  random: Random,
  vehicles: { id: number; type: EquipmentType; agency: Agency }[],
): AgentInput[] {
  const usedNames = new Set<string>();
  const freeVehicles = [...vehicles];
  const agents: AgentInput[] = [];
  let badgeCounter = 1000;

  for (const { role, count, ranks } of ROLE_PLAN) {
    for (let index = 0; index < count; index += 1) {
      let name: string;
      do {
        name = `${random.pick(FIRST_NAMES)} ${random.pick(LAST_NAMES)}`;
      } while (usedNames.has(name));
      usedNames.add(name);

      const region =
        role === "traffic_agent"
          ? random.chance(0.4)
            ? "center"
            : random.pick(city.regions).id
          : random.pick(city.regions).id;
      const regionNeighborhoods = city.neighborhoods.filter((item) => item.regionId === region);
      const base = random.pick(
        regionNeighborhoods.length > 0 ? regionNeighborhoods : city.neighborhoods,
      );
      const regionName = city.regions.find((item) => item.id === region)?.name ?? "Centro";
      const baseName = {
        traffic_agent: `Base de Trânsito ${regionName}`,
        municipal_guard: `Base GCM ${regionName}`,
        military_police: `Base PM ${regionName}`,
      }[role];

      const agency = AGENT_ROLES[role].agency;
      const vehicleIndex = freeVehicles.findIndex((vehicle) =>
        role === "traffic_agent"
          ? vehicle.type === "agent_motorcycle"
          : vehicle.type === "patrol_vehicle" && vehicle.agency === agency,
      );
      const vehicle =
        vehicleIndex >= 0 && random.chance(0.8)
          ? freeVehicles.splice(vehicleIndex, 1)[0]
          : undefined;

      badgeCounter += random.int(1, 37);
      agents.push({
        name,
        badge: `${{ traffic_agent: "AT", municipal_guard: "GCM", military_police: "PM" }[role]}-${badgeCounter}`,
        role,
        rank: random.pick(ranks),
        phone: `(14) 9${random.int(8000, 9999)}-${String(random.int(0, 9999)).padStart(4, "0")}`,
        shift: random.weighted(
          ["morning", "afternoon", "night"] as const,
          (shift) => SHIFT_WEIGHTS[shift],
        ),
        status: "off_duty",
        baseName,
        baseNeighborhoodId: base.id,
        lat: Number(jitter(random, base.lat, 150).toFixed(6)),
        lng: Number(jitter(random, base.lng, 150).toFixed(6)),
        vehicleId: vehicle?.id ?? null,
      });
    }
  }
  return agents;
}
