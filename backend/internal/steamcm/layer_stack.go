package steamcm

type layerStack struct {
	bottom Layer
	top    Layer
}

func MakeLayerStack(layers ...Layer) Layer {
	if len(layers) == 1 {
		return layers[0]
	}

	return NewLayerStack(
		layers[0],
		MakeLayerStack(layers[1:]...),
	)
}

func NewLayerStack(bottom Layer, top Layer) *layerStack {
	return &layerStack{bottom: bottom, top: top}
}

func (layer *layerStack) ProcessIncoming(events []Event) ([]Event, error) {
	eventsToProcess, eventsToForward := layer.splitEvents(events, EventType_Incoming)
	bottomEvents, err := layer.bottom.ProcessIncoming(eventsToProcess)
	if err != nil {
		return nil, err
	}
	topEvents, err := layer.top.ProcessIncoming(bottomEvents)
	if err != nil {
		return nil, err
	}
	_events, err := layer.bottom.ProcessOutgoing(topEvents)
	if err != nil {
		return nil, err
	}
	eventsToForward = append(eventsToForward, _events...)
	return eventsToForward, nil
}

func (layer *layerStack) ProcessOutgoing(events []Event) ([]Event, error) {
	eventsToProcess, eventsToForward := layer.splitEvents(events, EventType_Outgoing)
	topEvents, err := layer.top.ProcessOutgoing(eventsToProcess)
	if err != nil {
		return nil, err
	}
	bottomEvents, err := layer.bottom.ProcessOutgoing(topEvents)
	if err != nil {
		return nil, err
	}
	_events, err := layer.top.ProcessIncoming(bottomEvents)
	if err != nil {
		return nil, err
	}
	eventsToForward = append(eventsToForward, _events...)
	return eventsToForward, nil
}

func (layer *layerStack) splitEvents(events []Event, etype EventType) ([]Event, []Event) {
	eventsToProcess := make([]Event, 0)
	eventsToForward := make([]Event, 0)

	for _, event := range events {
		if event.Type == etype {
			eventsToProcess = append(eventsToProcess, event)
		} else {
			eventsToForward = append(eventsToForward, event)
		}
	}

	return eventsToProcess, eventsToForward
}
