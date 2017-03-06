"use strict"
let rest = require('connect-rest')

module.exports = (context) =>
{
    //
    //   S E R V I C E   F U N C T I O N S
    //

    //
    //   C O N T E X T   D E F I N I T I O N
    //
    rest.context(context)

    //
    //   S E R V I C E   R E G I S T R A T I O N
    //

    return rest;
}
