import type { ServerResponse } from 'node:http';

/** Publiczny payload zdarzenia SSE, bez sekretów i wewnętrznych pól bazy. */
export interface MeasurementEvent {
  id:string;seriesId:string;value:number;timestamp:string;sensorId?:string;
}

/** Tworzy procesowy rejestr otwartych odpowiedzi SSE; nie odtwarza historycznych zdarzeń. */
export function createEventsService() {
  const clients=new Set<ServerResponse>();
  return {
    /** Dodaje odpowiedź HTTP do odbiorców nowych pomiarów; nagłówki ustawia trasa SSE. */
    register(response:ServerResponse) { clients.add(response); },
    /** Usuwa zamkniętego odbiorcę z rejestru; wielokrotne wywołanie jest bezpieczne. */
    unregister(response:ServerResponse) { clients.delete(response); },
    /**
     * Serializuje publiczny pomiar do ramki SSE i rozsyła ją aktywnym klientom.
     * Zamyka odbiorców z buforem powyżej 64 KiB, aby wolny klient nie zwiększał pamięci bez ograniczeń.
     */
    publish(measurement:MeasurementEvent) {
      const frame=`event: measurement\ndata: ${JSON.stringify(measurement)}\n\n`;
      for(const response of clients) {
        if(response.destroyed || response.writableEnded) {clients.delete(response);continue;}
        // Klient, który nie odbiera danych, nie może bez końca zwiększać bufora.
        if(response.writableLength>64*1024) {response.end();clients.delete(response);continue;}
        try {response.write(frame);} catch {clients.delete(response);}
      }
    },
    /** Kończy wszystkie odpowiedzi SSE i opróżnia rejestr przed zamknięciem serwera. */
    close() {for(const response of clients)response.end();clients.clear();},
  };
}
/** Interfejs serwisu wywnioskowany z jego fabryki; kontrolery zależą od niego zamiast od implementacji SQL. */
export type EventsService=ReturnType<typeof createEventsService>;
