import type { ServerResponse } from 'node:http';

export interface MeasurementEvent {
  id:string;seriesId:string;value:number;timestamp:string;sensorId?:string;
}

/** Nadawanie zdarzeń do podłączonych przeglądarek bez dostępu do sekretów czujników. */
export function createEventsService() {
  const clients=new Set<ServerResponse>();
  return {
    register(response:ServerResponse) { clients.add(response); },
    unregister(response:ServerResponse) { clients.delete(response); },
    publish(measurement:MeasurementEvent) {
      const frame=`event: measurement\ndata: ${JSON.stringify(measurement)}\n\n`;
      for(const response of clients) {
        if(response.destroyed || response.writableEnded) {clients.delete(response);continue;}
        // Klient, który nie odbiera danych, nie może bez końca zwiększać bufora.
        if(response.writableLength>64*1024) {response.end();clients.delete(response);continue;}
        try {response.write(frame);} catch {clients.delete(response);}
      }
    },
    close() {for(const response of clients)response.end();clients.clear();},
  };
}
export type EventsService=ReturnType<typeof createEventsService>;
