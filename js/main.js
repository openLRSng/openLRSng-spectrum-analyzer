var connectionId = -1;
var port_list;
var serial_poll = 0; // iterval timer refference

$(document).ready(function() {
    port_picker = $('div#port-picker .port select');
    baud_picker = $('div#port-picker #baud');
    
    $('div#port-picker a.refresh').click(function() {
        console.log("Available port list requested.");
        port_picker.html('');

        chrome.serial.getPorts(function(ports) {
            if (ports.length > 0) {
                // Port list received
                
                ports.forEach(function(port) {
                    $(port_picker).append($("<option/>", {
                        value: port,
                        text: port
                    }));        
                });
            } else {
                $(port_picker).append('<option>NOT FOUND</option>');
                
                console.log("No serial ports detected");
            }
        });
    });
    
    // software click to refresh port picker select (during initial load)
    $('div#port-picker a.refresh').click(); 

    $('div#port-picker a.connect').click(function() {
        var clicks = $(this).data('clicks');
        
        if (clicks) { // odd number of clicks
            chrome.serial.close(connectionId, onClosed);
            
            clearInterval(serial_poll);
            serial_poll = 0; // this also indicates that we are not reading anything
            
            $(this).text('Connect');
            $(this).removeClass('active');            
        } else { // even number of clicks         
            selected_port = String($(port_picker).val());
            selected_baud = parseInt(baud_picker.val());
            
            console.log('Connecting to: ' + selected_port);
            
            chrome.serial.open(selected_port, {
                bitrate: selected_baud
            }, onOpen);
            
            $(this).text('Disconnect');  
            $(this).addClass('active');
        }
        
        $(this).data("clicks", !clicks);
    });     
    
});

function readPoll() {
    chrome.serial.read(connectionId, 12, onCharRead);
}

function onOpen(openInfo) {
    connectionId = openInfo.connectionId;
    
    if (connectionId != -1) {
        // start polling
        serial_poll = setInterval(readPoll, 10);
        
        console.log('Connection established.');
    } else {
        console.log('There was a problem while opening the connection.');
    }
}

function onClosed(result) {
    if (result == 1) {
        console.log('Connection closed successfully.');
    } else {
        console.log('There was an error that happened during "connection-close" procedure.');
    }
}

var message_buffer = new Array();
var message_buffer_needle = 0;

function onCharRead(readInfo) {
    if (readInfo && readInfo.bytesRead > 0 && readInfo.data) {
        var data = new Uint8Array(readInfo.data);
        
        for (var i = 0; i < data.length; i++) {
            if (data[i] == 0x0A) { // new line character \n
                // process message and start receiving a new one
                process_message(message_buffer);
                
                message_buffer = new Array();
                message_buffer_needle = 0;
            } else {            
                message_buffer[message_buffer_needle++] = data[i];
            }    
        }
    }
}

var message_needle = 0;

function process_message(message_buffer) {
    var message = {
        frequency: 0,
        RSSI_MAX:  0,
        RSSI_SUM:  0,
        RSSI_MIN:  0
    };

    for (var i = 0; i < message_buffer.length; i++) {
        if (message_buffer[i] == 0x2C) { // divider ,
            message_needle++;
        } else {
            message_buffer[i] -= 0x30;
            
            switch (message_needle) {
                case 0:
                    message.frequency = message.frequency * 10 + message_buffer[i];
                    break;
                case 1:
                    message.RSSI_MAX = message.RSSI_MAX * 10 + message_buffer[i];
                    break;
                case 2:
                    message.RSSI_SUM = message.RSSI_SUM * 10 + message_buffer[i];
                    break;
                case 3:
                    message.RSSI_MIN = message.RSSI_MIN * 10 + message_buffer[i];
                    break;
            }
        }
    }
    
    message_needle = 0;
    
    // Update plot
    update_plot(message);
}

function update_plot(message) {
    console.log(message);
}