import { supabase } from '@/lib/supabase';

interface AcceptResponse {
  status: number;
  message: string;
}

export async function handleAcceptance(
  dispatchLogId: string, 
  ambulanceId: string, 
  incidentId: string
): Promise<AcceptResponse> {
  try {
    // Step 1: Attempt to claim the ambulance
    const { data: ambulanceUpdate, error: ambulanceError } = await supabase
      .from('ambulances')
      .update({ 
        status: 'DISPATCHED', 
        assigned_incident: incidentId 
      })
      .eq('id', ambulanceId)
      .eq('status', 'AVAILABLE')
      .select();

    if (ambulanceError) throw ambulanceError;

    // If no rows were returned, another dispatcher already claimed this ambulance
    if (!ambulanceUpdate || ambulanceUpdate.length === 0) {
      return { 
        status: 400, 
        message: "All ambulances are currently busy or this ambulance has already been dispatched." 
      };
    }

    // Step 2: Update the dispatch log to ACCEPTED
    const { error: logError } = await supabase
      .from('dispatch_logs')
      .update({ status: 'ACCEPTED' })
      .eq('id', dispatchLogId);

    if (logError) {
      // Rollback the ambulance claim if log fails
      await supabase
        .from('ambulances')
        .update({ status: 'AVAILABLE', assigned_incident: null })
        .eq('id', ambulanceId);
        
      throw logError;
    }

    return { 
      status: 200, 
      message: "Ambulance dispatched successfully." 
    };

  } catch (error) {
    console.error("Acceptance Transaction Failed:", error);
    return { 
      status: 500, 
      message: "An internal server error occurred during the handshake." 
    };
  }
}
