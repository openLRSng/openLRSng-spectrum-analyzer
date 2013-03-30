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
            
            $(this).text('Connect');
            $(this).removeClass('active');            
        } else { // even number of clicks         
            selected_port = String($(port_picker).val());
            selected_baud = parseInt(baud_picker.val());
            
            console.log('Connecting to: ' + selected_port);
            
            // Reset pause button if necessary
            if ($('.pause-resume').data('clicks') == true) {
                $('.pause-resume').click();
            }
            
            chrome.serial.open(selected_port, {
                bitrate: selected_baud
            }, onOpen);
            
            $(this).text('Disconnect');  
            $(this).addClass('active');
        }
        
        $(this).data("clicks", !clicks);
    }); 
});

function onOpen(openInfo) {
    connectionId = openInfo.connectionId;
    
    if (connectionId != -1) {
        // start polling
        serial_poll = setInterval(readPoll, 10);
        plot_poll = setInterval(redraw_plot, 40);
        port_usage_poll = setInterval(port_usage, 1000);
        
        // Send over the configuration
        send_current_configuration();
        
        console.log('Connection established.');
    } else {
        console.log('There was a problem while opening the connection.');
    }
}

function onClosed(result) {
    clearInterval(serial_poll);
    clearInterval(port_usage_poll);
    
    // delete the port load information from screen
    $('dt.port-usage').html('');
    
    if (result == 1) {
        connectionId = -1; // reset connection id
        console.log('Connection closed successfully.');
    } else {
        console.log('There was an error that happened during "connection-close" procedure.');
    }
}

function readPoll() {
    chrome.serial.read(connectionId, 256, onCharRead);
}

var message_buffer = new Array();
var char_counter = 0;
function onCharRead(readInfo) {
    if (readInfo && readInfo.bytesRead > 0 && readInfo.data) {
        var data = new Uint8Array(readInfo.data);
        
        for (var i = 0; i < data.length; i++) {
            if (data[i] == 0x0A) { // new line character \n
                // process message and start receiving a new one
                process_message(message_buffer);
                
                // empty buffer
                message_buffer = [];
            } else {            
                message_buffer.push(data[i]);
            }

            char_counter++;
        }
    }
}

function port_usage() {
    var port_usage = (char_counter * 10 / selected_baud) * 100;    
    $('dt.port-usage').html(parseInt(port_usage) + '%');

    // reset counter
    char_counter = 0;
}