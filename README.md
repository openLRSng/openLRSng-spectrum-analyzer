openLRSng Spectrum Analyzer
=================================================
This project was designed to work with with openLRSng code @ https://github.com/kh4/openLRSng

Spectrum Analyzer is based on chrome.serial API (found in chromium and google chrome since v23).

Using Flotr2 plotting library for visualization.

Integrated javascript serial API inside the browser assures full compatibility for Windows, Linux and Mac OSX.

Default baudrate (also recommended baud rate) for the TX or RX unit is 115200 (due to high bandwith requirements).

Installation
------------
1. - Clone the repo to any local directory or download it as zip
2. - Start chromium or google chrome and go to tools -> extension
3. - Check the "Developer mode" checkbox
4. - Click on load unpacked extension and point it to the spectrum analyzer directory (for example D:/openLRSng-spectrum-analyzer)
5. - You are done

Hows to use
-----------
You can find the spectrum analyzer icon in your application tab "Apps"

Application should work "out of the box" on both Windows and Mac OSX

On Linux the situation is a little tricky.
There is an outstanding bug in chromium/google chrome which is preventing setting the correct baud rate via the UI
this bug will be fixed in version 27, but till then you might need to use an 3rd party utility like stty

example command to change the baud rate via stty
stty -F /dev/ttyUSB0 115200

