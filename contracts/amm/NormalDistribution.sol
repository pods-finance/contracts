// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "../interfaces/INormalDistribution.sol";
import "@nomiclabs/buidler/console.sol";

/**
 * Normal distribution
 */
contract NormalDistribution is INormalDistribution {
    mapping(int256 => int256) private _probabilities;

    constructor() public {
        _probabilities[100] = 5040;
        _probabilities[200] = 5080;
        _probabilities[300] = 5120;
        _probabilities[400] = 5160;
        _probabilities[500] = 5199;
        _probabilities[600] = 5239;
        _probabilities[700] = 5279;
        _probabilities[800] = 5319;
        _probabilities[900] = 5359;
        _probabilities[1000] = 5398;
        _probabilities[1100] = 5438;
        _probabilities[1200] = 5478;
        _probabilities[1300] = 5517;
        _probabilities[1400] = 5557;
        _probabilities[1500] = 5596;
        _probabilities[1600] = 5636;
        _probabilities[1700] = 5675;
        _probabilities[1800] = 5714;
        _probabilities[1900] = 5753;
        _probabilities[2000] = 5793;
        _probabilities[2100] = 5832;
        _probabilities[2200] = 5871;
        _probabilities[2300] = 5910;
        _probabilities[2400] = 5948;
        _probabilities[2500] = 5987;
        _probabilities[2600] = 6026;
        _probabilities[2700] = 6064;
        _probabilities[2800] = 6103;
        _probabilities[2900] = 6141;
        _probabilities[3000] = 6179;
        _probabilities[3100] = 6217;
        _probabilities[3200] = 6255;
        _probabilities[3300] = 6293;
        _probabilities[3400] = 6331;
        _probabilities[3500] = 6368;
        _probabilities[3600] = 6406;
        _probabilities[3700] = 6443;
        _probabilities[3800] = 6480;
        _probabilities[3900] = 6517;
        _probabilities[4000] = 6554;
        _probabilities[4100] = 6591;
        _probabilities[4200] = 6628;
        _probabilities[4300] = 6664;
        _probabilities[4400] = 6700;
        _probabilities[4500] = 6736;
        _probabilities[4600] = 6772;
        _probabilities[4700] = 6808;
        _probabilities[4800] = 6844;
        _probabilities[4900] = 6879;
        _probabilities[5000] = 6915;
        _probabilities[5100] = 6950;
        _probabilities[5200] = 6985;
        _probabilities[5300] = 7019;
        _probabilities[5400] = 7054;
        _probabilities[5500] = 7088;
        _probabilities[5600] = 7123;
        _probabilities[5700] = 7157;
        _probabilities[5800] = 7190;
        _probabilities[5900] = 7224;
        _probabilities[6000] = 7257;
        _probabilities[6100] = 7291;
        _probabilities[6200] = 7324;
        _probabilities[6300] = 7357;
        _probabilities[6400] = 7389;
        _probabilities[6500] = 7422;
        _probabilities[6600] = 7454;
        _probabilities[6700] = 7486;
        _probabilities[6800] = 7517;
        _probabilities[6900] = 7549;
        _probabilities[7000] = 7580;
        _probabilities[7100] = 7611;
        _probabilities[7200] = 7642;
        _probabilities[7300] = 7673;
        _probabilities[7400] = 7704;
        _probabilities[7500] = 7734;
        _probabilities[7600] = 7764;
        _probabilities[7700] = 7794;
        _probabilities[7800] = 7823;
        _probabilities[7900] = 7852;
        _probabilities[8000] = 7881;
        _probabilities[8100] = 7910;
        _probabilities[8200] = 7939;
        _probabilities[8300] = 7967;
        _probabilities[8400] = 7995;
        _probabilities[8500] = 8023;
        _probabilities[8600] = 8051;
        _probabilities[8700] = 8078;
        _probabilities[8800] = 8106;
        _probabilities[8900] = 8133;
        _probabilities[9000] = 8159;
        _probabilities[9100] = 8186;
        _probabilities[9200] = 8212;
        _probabilities[9300] = 8238;
        _probabilities[9400] = 8264;
        _probabilities[9500] = 8289;
        _probabilities[9600] = 8315;
        _probabilities[9700] = 8340;
        _probabilities[9800] = 8365;
        _probabilities[9900] = 8389;
        _probabilities[10000] = 8413;
        _probabilities[10100] = 8438;
        _probabilities[10200] = 8461;
        _probabilities[10300] = 8485;
        _probabilities[10400] = 8508;
        _probabilities[10500] = 8531;
        _probabilities[10600] = 8554;
        _probabilities[10700] = 8577;
        _probabilities[10800] = 8599;
        _probabilities[10900] = 8621;
        _probabilities[11000] = 8643;
        _probabilities[11100] = 8665;
        _probabilities[11200] = 8686;
        _probabilities[11300] = 8708;
        _probabilities[11400] = 8729;
        _probabilities[11500] = 8749;
        _probabilities[11600] = 8770;
        _probabilities[11700] = 8790;
        _probabilities[11800] = 8810;
        _probabilities[11900] = 8830;
        _probabilities[12000] = 8849;
        _probabilities[12100] = 8869;
        _probabilities[12200] = 8888;
        _probabilities[12300] = 8907;
        _probabilities[12400] = 8925;
        _probabilities[12500] = 8944;
        _probabilities[12600] = 8962;
        _probabilities[12700] = 8980;
        _probabilities[12800] = 8997;
        _probabilities[12900] = 9015;
        _probabilities[13000] = 9032;
        _probabilities[13100] = 9049;
        _probabilities[13200] = 9066;
        _probabilities[13300] = 9082;
        _probabilities[13400] = 9099;
        _probabilities[13500] = 9115;
        _probabilities[13600] = 9131;
        _probabilities[13700] = 9147;
        _probabilities[13800] = 9162;
        _probabilities[13900] = 9177;
        _probabilities[14000] = 9192;
        _probabilities[14100] = 9207;
        _probabilities[14200] = 9222;
        _probabilities[14300] = 9236;
        _probabilities[14400] = 9251;
        _probabilities[14500] = 9265;
        _probabilities[14600] = 9279;
        _probabilities[14700] = 9292;
        _probabilities[14800] = 9306;
        _probabilities[14900] = 9319;
        _probabilities[15000] = 9332;
        _probabilities[15100] = 9345;
        _probabilities[15200] = 9357;
        _probabilities[15300] = 9370;
        _probabilities[15400] = 9382;
        _probabilities[15500] = 9394;
        _probabilities[15600] = 9406;
        _probabilities[15700] = 9418;
        _probabilities[15800] = 9429;
        _probabilities[15900] = 9441;
        _probabilities[16000] = 9452;
        _probabilities[16100] = 9463;
        _probabilities[16200] = 9474;
        _probabilities[16300] = 9484;
        _probabilities[16400] = 9495;
        _probabilities[16500] = 9505;
        _probabilities[16600] = 9515;
        _probabilities[16700] = 9525;
        _probabilities[16800] = 9535;
        _probabilities[16900] = 9545;
        _probabilities[17000] = 9554;
        _probabilities[17100] = 9564;
        _probabilities[17200] = 9573;
        _probabilities[17300] = 9582;
        _probabilities[17400] = 9591;
        _probabilities[17500] = 9599;
        _probabilities[17600] = 9608;
        _probabilities[17700] = 9616;
        _probabilities[17800] = 9625;
        _probabilities[17900] = 9633;
        _probabilities[18000] = 9641;
        _probabilities[18100] = 9649;
        _probabilities[18200] = 9656;
        _probabilities[18300] = 9664;
        _probabilities[18400] = 9671;
        _probabilities[18500] = 9678;
        _probabilities[18600] = 9686;
        _probabilities[18700] = 9693;
        _probabilities[18800] = 9699;
        _probabilities[18900] = 9706;
        _probabilities[19000] = 9713;
        _probabilities[19100] = 9719;
        _probabilities[19200] = 9726;
        _probabilities[19300] = 9732;
        _probabilities[19400] = 9738;
        _probabilities[19500] = 9744;
        _probabilities[19600] = 9750;
        _probabilities[19700] = 9756;
        _probabilities[19800] = 9761;
        _probabilities[19900] = 9767;
        _probabilities[20000] = 9772;
        _probabilities[20100] = 9778;
        _probabilities[20200] = 9783;
        _probabilities[20300] = 9788;
        _probabilities[20400] = 9793;
        _probabilities[20500] = 9798;
        _probabilities[20600] = 9803;
        _probabilities[20700] = 9808;
        _probabilities[20800] = 9812;
        _probabilities[20900] = 9817;
    }

    /**
     * Returns the probability of Z in a normal distribution curve
     * @dev For performance numbers are truncated to 2 decimals. Ex: 1134500000000000000(1.13) gets truncated to 113
     * @dev For Z > ±0.209 the curve response gets more linear
     * @param z A point in the normal distribution
     * @param decimals Amount of decimals of z
     * @return The probability of z
     */
    function getProbability(int256 z, uint256 decimals) external override view returns (int256) {
        require(decimals >= 2, "NormalDistribution: z too small");
        int256 truncateZ = mod((z / int256(10**(decimals - 2))) * 100);
        int256 responseDecimals = int256(10**(decimals - 4));

        // As Z approach 0.209 it is approximated to the nearest point stored possible
        if (truncateZ > 20900) {
            truncateZ = 20900;
        }
        // Handle negative z
        if (z < 0) {
            return (10000 - _probabilities[truncateZ]) * responseDecimals;
        }

        return _probabilities[truncateZ] * responseDecimals;
    }

    /**
     * @dev Returns the module of a number.
     */
    function mod(int256 a) internal pure returns (int256) {
        return a < 0 ? -a : a;
    }
}
