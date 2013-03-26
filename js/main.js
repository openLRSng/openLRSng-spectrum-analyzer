var connectionId = -1;
var port_list;
var serial_poll = 0; // iterval timer refference

var element_plot;
var plot;

var plot_data = new Array(3);
plot_data[0] = new Array();
plot_data[1] = new Array();
plot_data[2] = new Array();

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
    
    // Analyzer configuration UI hooks
    $('div#analyzer-configuration select').change(function() {
        start_frequency = parseInt($('#start-frequency').val());
        stop_frequency = parseInt($('#stop-frequency').val());
        average_samples = parseInt($('#average-samples').val());
        step_size = parseInt($('#step-size').val());
        
        send_current_configuration();     
    });
    
    // Populate configuration selects    
    var e_start_frequency = $('#start-frequency').html('');
    for (var i = 400; i < 470; i++) {
        e_start_frequency.append($("<option/>", {
            value: i,
            text: i
        }));        
    }
    
    var e_stop_frequency = $('#stop-frequency').html('');
    for (var i = 401; i < 471; i++) {
        e_stop_frequency.append($("<option/>", {
            value: i,
            text: i
        }));        
    }

    var e_average_samples = $('#average-samples').html('');
    for (var i = 100; i < 1501; i += 100) {
        
        e_average_samples.append($("<option/>", {
            value: i,
            text: i
        }));        
    }
    
    var e_step_size = $('#step-size').html('');
    for (var i = 1; i < 100; i += 1) {
        e_step_size.append($("<option/>", {
            value: i,
            text: i
        }));        
    }
    
    // Define some defualt values
    e_start_frequency.val(425);
    e_stop_frequency.val(435);
    e_step_size.val('5');
    
    // manually fire change event so variables get populated
    $('div#analyzer-configuration select').change(); 
    
    // Plot
    element_plot = document.getElementById("plot");
    
    plot_options = {
        colors: ['#d60606', '#00a8f0', '#c0d800'],
        shadowSize: 0,
        yaxis : {
            min: 0,
            max: 150,
            autoscale: true,
        },
        xaxis : {
            noTicks : 10,
            max : 44000,
            min : 43000,
            tickFormatter: function(x) {
                var x = parseInt(x);
                x /= 100;
                return x + ' MHz';
            }
        },
        grid : {
            backgroundColor: "#FFFFFF"
        },
        legend : {
            position: "wn",
            backgroundOpacity: 0
        }
    }

    plot = Flotr.draw(element_plot, [ 
        {data: plot_data[0], label: "RSSI - MAX"}, 
        {data: plot_data[1], label: "RSSI - AVERAGE"}, 
        {data: plot_data[2], label: "RSSI - MIN"} ], plot_options);       
});

function readPoll() {
    chrome.serial.read(connectionId, 256, onCharRead);
}

function onOpen(openInfo) {
    connectionId = openInfo.connectionId;
    
    if (connectionId != -1) {
        // start polling
        serial_poll = setInterval(readPoll, 10);
        
        // Send over the configuration
        send_current_configuration();
        
        console.log('Connection established.');
    } else {
        console.log('There was a problem while opening the connection.');
    }
}

function onClosed(result) {
    if (result == 1) {
        connectionId = -1; // reset connection id
        console.log('Connection closed successfully.');
    } else {
        console.log('There was an error that happened during "connection-close" procedure.');
    }
}

function send_current_configuration() {    
    if (connectionId > 0) {    
        var ascii = {
            start_frequency: start_frequency.toString(),
            stop_frequency: stop_frequency.toString(),
            average_samples: average_samples.toString(),
            step_size: step_size.toString()
        };
        
        var ascii_out = "#" + ascii.start_frequency + "," + ascii.stop_frequency + "," + ascii.average_samples + "," + ascii.step_size + ",";
        
        var bufferOut = new ArrayBuffer(ascii_out.length);
        var bufView = new Uint8Array(bufferOut);
        
        for (var i = 0; i < ascii_out.length; i++) {
            bufView[i] = ascii_out.charCodeAt(i);
        }

        // Send over the configuration
        chrome.serial.write(connectionId, bufferOut, function(writeInfo) {
            console.log("Wrote: " + writeInfo.bytesWritten + " bytes");
        });
    }
}

var message_buffer = new Array();
function onCharRead(readInfo) {
    if (readInfo && readInfo.bytesRead > 0 && readInfo.data) {
        var data = new Uint8Array(readInfo.data);
        
        for (var i = 0; i < data.length; i++) {
            if (data[i] == 0x0A) { // new line character \n
                // process message and start receiving a new one
                process_message(message_buffer);
                
                // empty buffer
                message_buffer = new Array();
            } else {            
                message_buffer.push(data[i]);
            }    
        }
    }
}

function process_message(message_buffer) {
    var message_needle = 0;
    
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
    
    update_plot(message);
}

var previous_frequency = 0;
function update_plot(message) {
    if (message.frequency < previous_frequency) { // new series of data
        // this part is broken
        plot_data[0] = [];
        plot_data[1] = [];
        plot_data[2] = [];
        
        // Update plot
        plot_options.xaxis.max = stop_frequency * 100;
        plot_options.xaxis.min = start_frequency * 100;   
    }
    
    previous_frequency = message.frequency;
    
    plot_data[0].push([message.frequency, message.RSSI_MAX]);
    plot_data[1].push([message.frequency, message.RSSI_SUM]);
    plot_data[2].push([message.frequency, message.RSSI_MIN]);
    
    // redraw with latest data
    plot = Flotr.draw(element_plot, [ 
        {data: plot_data[0], label: "RSSI - MAX", lines: {fill: false}}, 
        {data: plot_data[1], label: "RSSI - AVERAGE", lines: {fill: false}}, 
        {data: plot_data[2], label: "RSSI - MIN", lines: {fill: true}} ], plot_options);       
}