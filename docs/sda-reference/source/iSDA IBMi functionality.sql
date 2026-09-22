--Step 1
CALL QSYS2.QCMDEXC('CRTLIB LIB(SDATST) TEXT(''I-SDA I-116 capture'')');
CALL QSYS2.QCMDEXC('CRTSRCPF FILE(SDATST/QDDSSRC) RCDLEN(112)');
CALL QSYS2.QCMDEXC('ADDPFM FILE(SDATST/QDDSSRC) MBR(TESTPF) SRCTYPE(PF)');
CREATE OR REPLACE ALIAS SDATST.QDDSSRC_TESTPF FOR SDATST.QDDSSRC (TESTPF);
DELETE FROM SDATST.QDDSSRC_TESTPF;

CALL QSYS2.QCMDEXC('CRTLIB LIB(SDATST) TEXT(''I-SDA I-116 capture'')');
CALL QSYS2.QCMDEXC('CRTSRCPF FILE(SDATST/QDDSSRC) RCDLEN(112)');
CALL QSYS2.QCMDEXC('ADDPFM FILE(SDATST/QDDSSRC) MBR(TESTPF) SRCTYPE(PF)');
CREATE OR REPLACE ALIAS SDATST.QDDSSRC_TESTPF FOR SDATST.QDDSSRC (TESTPF);

---old insert sql , which failed
INSERT INTO SDATST.QDDSSRC_TESTPF (SRCSEQ, SRCDAT, SRCDTA) VALUES
  (1, 0, '     A          R TESTFMT'),
  (2, 0, '     A            FLDME         10A         CHECK(ME)'),
  (3, 0, '     A            FLDRANGE       5S 0       RANGE(1 99999)'),
  (4, 0, '     A            FLDVALS        1A         VALUES(''A'' ''B'' ''C'')'),
  (5, 0, '     A            FLDCOMP        7P 2       COMP(GT 0)'),
  (6, 0, '     A            FLDCOMPC       3A         COMP(EQ ''XYZ'')'),
  (7, 0, '     A            FLDNEG         7S 2       RANGE(-5.5 100.25)'),
  (8, 0, '     A            FLDM10         6S 0       CHECK(M10)'),
  (9, 0, '     A            FLDVN          9S 2       CHECK(VN)'),
  (10, 0, '     A            FLDAB          5A         CHECK(AB)'),
  (11, 0, '     A            FLDMSG         5S 0       RANGE(10 20)'),
  (12, 0, '     A                                      CHKMSGID(CPF9897 QSYS/QCPFMSG)'),
  (13, 0, '     A            FLDMSGD        5S 0       VALUES(1 2 3)'),
  (14, 0, '     A                                      CHKMSGID(CPF9897 QCPFMSG &FLDDTA)'),
  (15, 0, '     A            FLDDTA        20A'),
  (16, 0, '     A            FLDMULT        5S 0       CHECK(ME)'),
  (17, 0, '     A                                      COMP(GT 0)'),
  (18, 0, '     A                                      COMP(LT 100)'),
  (19, 0, '     A            FLDSGL         7F 2'),
  (20, 0, '     A            FLDDBL        15F 2'),
  (21, 0, '     A            FLDNONE        5A');

CALL QSYS2.QCMDEXC('CRTPF FILE(SDATST/TESTPF) SRCFILE(SDATST/QDDSSRC) SRCMBR(TESTPF)');

--Failure details as below
--below are step 1 failures
     900       A            FLDVN          9S 2       CHECK(VN)        
 *                                                  CPD7554-*          
    1000       A            FLDAB          5A         CHECK(AB)        
 *                                                  CPD7656-*          
   1600       A            FLDMULT        5S 0       CHECK(ME)          
   1700       A                                      COMP(GT 0)         
   1800       A                                      COMP(LT 100)       
*                                            CPD7492-*                  
   2000       A            FLDDBL        15F 2         
*                             CPD7635-*****            

* CPD7492      20        1      Message . . . . :   Keyword specified more than once in one specification.         
* CPD7554      20        1      Message . . . . :   Keyword not valid with data type or keyboard shift value.      
* CPD7635      30        1      Message . . . . :   Length too large for floating-point precision.                           
* CPD7656      20        1      Message . . . . :   Indicated keyword requires validity checking keyword.

--New insert which passed is below
INSERT INTO SDATST.QDDSSRC_TESTPF (SRCSEQ, SRCDAT, SRCDTA) VALUES
  (1, 0, '     A          R TESTFMT'),
  (2, 0, '     A            FLDME         10A         CHECK(ME)'),
  (3, 0, '     A            FLDRANGE       5S 0       RANGE(1 99999)'),
  (4, 0, '     A            FLDVALS        1A         VALUES(''A'' ''B'' ''C'')'),
  (5, 0, '     A            FLDCOMP        7P 2       COMP(GT 0)'),
  (6, 0, '     A            FLDCOMPC       3A         COMP(EQ ''XYZ'')'),
  (7, 0, '     A            FLDNEG         7S 2       RANGE(-5.5 100.25)'),
  (8, 0, '     A            FLDM10         6S 0       CHECK(M10)'),
  (9, 0, '     A            FLDVN          9A         CHECK(VN)'),
  (10, 0, '     A            FLDAB          5A         VALUES(''A'' ''B'')'),
  (11, 0, '     A                                      CHECK(AB)'),
  (12, 0, '     A            FLDMSG         5S 0       RANGE(10 20)'),
  (13, 0, '     A                                      CHKMSGID(CPF9897 QSYS/QCPFMSG)'),
  (14, 0, '     A            FLDMSGD        5S 0       VALUES(1 2 3)'),
  (15, 0, '     A                                      CHKMSGID(CPF9897 QCPFMSG &FLDDTA)'),
  (16, 0, '     A            FLDDTA        20A'),
  (17, 0, '     A            FLDMULT        5S 0       RANGE(1 99)'),
  (18, 0, '     A                                      CHECK(ME)'),
  (19, 0, '     A            FLDSGL         7F 2       FLTPCN(*SINGLE)'),
  (20, 0, '     A            FLDDBL        15F 2       FLTPCN(*DOUBLE)'),
  (21, 0, '     A            FLDNONE        5A');

CALL QSYS2.QCMDEXC('CRTPF FILE(SDATST/TESTPF) SRCFILE(SDATST/QDDSSRC) SRCMBR(TESTPF)');

--Step 2
SELECT OS_VERSION, OS_RELEASE FROM SYSIBMADM.ENV_SYS_INFO;
OS version - 7 and OS-Release - 03
SELECT CURRENT_NUMERIC_VALUE AS QCCSID FROM QSYS2.SYSTEM_VALUE_INFO WHERE SYSTEM_VALUE_NAME = 'QCCSID';
QCCSID = 65535, which is EBCIDIC = 37

CALL QSYS2.QCMDEXC('DSPFFD FILE(SDATST/TESTPF) OUTPUT(*OUTFILE) OUTFILE(SDATST/FFDOUT)');
SELECT WHFLDI, WHFLDT, WHFLDB, WHFLDD, WHFLDP, WHVCNE, WHCSID, WHECDE
  FROM SDATST.FFDOUT ORDER BY WHFOBO;

--Step 3 dump - which is also failure
CREATE OR REPLACE PROCEDURE SDATST.RTVFD_HEX ()
  LANGUAGE SQL
  RESULT SETS 1
BEGIN
  DECLARE V_RCV     CHAR(32000) FOR BIT DATA DEFAULT X'00';
  DECLARE V_RCVLEN  INTEGER DEFAULT 32000;
  DECLARE V_RTNFILE CHAR(20) DEFAULT ' ';
  DECLARE V_FMT     CHAR(8)  DEFAULT 'FILD0200';
  DECLARE V_FILE    CHAR(20) DEFAULT 'TESTPF    SDATST    ';
  DECLARE V_RECFMT  CHAR(10) DEFAULT '*FIRST    ';
  DECLARE V_OVR     CHAR(1)  DEFAULT '0';
  DECLARE V_SYS     CHAR(10) DEFAULT '*LCL      ';
  DECLARE V_TYPE    CHAR(10) DEFAULT '*EXT      ';
  DECLARE V_ERR     CHAR(16) FOR BIT DATA DEFAULT X'00000010000000000000000000000000';
  DECLARE C1 CURSOR WITH RETURN FOR
    WITH T(N) AS (VALUES 0 UNION ALL SELECT N + 1 FROM T WHERE N < 159)
    SELECT N * 64 AS OFFSET, HEX(SUBSTR(V_RCV, N * 64 + 1, 64)) AS HEXDATA
      FROM T ORDER BY N;

  CALL QSYS.QDBRTVFD(V_RCV, V_RCVLEN, V_RTNFILE, V_FMT, V_FILE, V_RECFMT, V_OVR, V_SYS, V_TYPE, V_ERR);
  OPEN C1;
END;

CALL SDATST.RTVFD_HEX();

--Block A
CREATE OR REPLACE PROCEDURE SDATST.RTVFD_DIAG ()
  LANGUAGE SQL
  RESULT SETS 1
BEGIN
  DECLARE SQLCODE   INTEGER DEFAULT 0;
  DECLARE V_CODE    INTEGER DEFAULT 0;
  DECLARE V_RCV     CHAR(32000) FOR BIT DATA;
  DECLARE V_RCVLEN  INTEGER DEFAULT 32000;
  DECLARE V_RTNFILE CHAR(20) DEFAULT ' ';
  DECLARE V_FMT     CHAR(8)  DEFAULT 'FILD0200';
  DECLARE V_FILE    CHAR(20) DEFAULT 'TESTPF    SDATST    ';
  DECLARE V_RECFMT  CHAR(10) DEFAULT '*FIRST    ';
  DECLARE V_OVR     CHAR(1)  DEFAULT '0';
  DECLARE V_SYS     CHAR(10) DEFAULT '*LCL      ';
  DECLARE V_TYPE    CHAR(10) DEFAULT '*EXT      ';
  DECLARE V_ERR     CHAR(16) FOR BIT DATA DEFAULT X'00000010000000000000000000000000';
  DECLARE C1 CURSOR WITH RETURN FOR
    WITH T(N) AS (VALUES 0 UNION ALL SELECT N + 1 FROM T WHERE N < 127)
    SELECT 'DIAG' AS K, 0 AS OFFSET,
           'SQLCODE=' || CHAR(V_CODE) || ' ERR=' || HEX(V_ERR) ||
           ' RTNFILE=' || TRIM(V_RTNFILE) || ' RCVLEN=' || CHAR(V_RCVLEN) AS HEXDATA
      FROM SYSIBM.SYSDUMMY1
    UNION ALL
    SELECT 'RCV', N * 64, HEX(SUBSTR(V_RCV, N * 64 + 1, 64)) FROM T
    ORDER BY 1, 2;

  SET V_RCV = X'DEADBEEFDEADBEEF';
  CALL QSYS.QDBRTVFD(V_RCV, V_RCVLEN, V_RTNFILE, V_FMT, V_FILE, V_RECFMT, V_OVR, V_SYS, V_TYPE, V_ERR);
  SET V_CODE = SQLCODE;
  OPEN C1;
END;

CALL SDATST.RTVFD_DIAG();

--Block B - requries to be investigated for further processing
CREATE OR REPLACE PROCEDURE SDATST.QDBRTVFD_X (
  INOUT P_RCV     CHAR(32000) FOR BIT DATA,
  INOUT P_RCVLEN  INTEGER,
  INOUT P_RTNFILE CHAR(20),
  INOUT P_FMT     CHAR(8),
  INOUT P_FILE    CHAR(20),
  INOUT P_RECFMT  CHAR(10),
  INOUT P_OVR     CHAR(1),
  INOUT P_SYS     CHAR(10),
  INOUT P_TYPE    CHAR(10),
  INOUT P_ERR     CHAR(16) FOR BIT DATA)
  LANGUAGE CL
  PARAMETER STYLE GENERAL
  NO SQL
  EXTERNAL NAME 'QSYS/QDBRTVFD';

CREATE OR REPLACE PROCEDURE SDATST.RTVFD_DIAG2 ()
  LANGUAGE SQL
  RESULT SETS 1
BEGIN
  DECLARE SQLCODE   INTEGER DEFAULT 0;
  DECLARE V_CODE    INTEGER DEFAULT 0;
  DECLARE V_RCV     CHAR(32000) FOR BIT DATA;
  DECLARE V_RCVLEN  INTEGER DEFAULT 32000;
  DECLARE V_RTNFILE CHAR(20) DEFAULT ' ';
  DECLARE V_FMT     CHAR(8)  DEFAULT 'FILD0200';
  DECLARE V_FILE    CHAR(20) DEFAULT 'TESTPF    SDATST    ';
  DECLARE V_RECFMT  CHAR(10) DEFAULT '*FIRST    ';
  DECLARE V_OVR     CHAR(1)  DEFAULT '0';
  DECLARE V_SYS     CHAR(10) DEFAULT '*LCL      ';
  DECLARE V_TYPE    CHAR(10) DEFAULT '*EXT      ';
  DECLARE V_ERR     CHAR(16) FOR BIT DATA DEFAULT X'00000010000000000000000000000000';
  DECLARE C1 CURSOR WITH RETURN FOR
    WITH T(N) AS (VALUES 0 UNION ALL SELECT N + 1 FROM T WHERE N < 127)
    SELECT 'DIAG' AS K, 0 AS OFFSET,
           'SQLCODE=' || CHAR(V_CODE) || ' ERR=' || HEX(V_ERR) ||
           ' RTNFILE=' || TRIM(V_RTNFILE) || ' RCVLEN=' || CHAR(V_RCVLEN) AS HEXDATA
      FROM SYSIBM.SYSDUMMY1
    UNION ALL
    SELECT 'RCV', N * 64, HEX(SUBSTR(V_RCV, N * 64 + 1, 64)) FROM T
    ORDER BY 1, 2;

  SET V_RCV = X'DEADBEEFDEADBEEF';
  CALL SDATST.QDBRTVFD_X(V_RCV, V_RCVLEN, V_RTNFILE, V_FMT, V_FILE, V_RECFMT, V_OVR, V_SYS, V_TYPE, V_ERR);
  SET V_CODE = SQLCODE;
  OPEN C1;
END;

CALL SDATST.RTVFD_DIAG2();

--Block C - qtemp function creation is not allowed

CREATE OR REPLACE PROCEDURE QTEMP.QDBRTVFD_X (
  INOUT P_RCV     CHAR(32000) FOR BIT DATA,
  INOUT P_RCVLEN  INTEGER,
  INOUT P_RTNFILE CHAR(20),
  INOUT P_FMT     CHAR(8),
  INOUT P_FILE    CHAR(20),
  INOUT P_RECFMT  CHAR(10),
  INOUT P_OVR     CHAR(1),
  INOUT P_SYS     CHAR(10),
  INOUT P_TYPE    CHAR(10),
  INOUT P_ERR     CHAR(16) FOR BIT DATA)
  LANGUAGE CL
  PARAMETER STYLE GENERAL
  NO SQL
  EXTERNAL NAME 'QSYS/QDBRTVFD';

CREATE OR REPLACE PROCEDURE QTEMP.RTVFD_DIAG3 ()
  LANGUAGE SQL
  RESULT SETS 1
BEGIN
  DECLARE SQLCODE   INTEGER DEFAULT 0;
  DECLARE V_CODE    INTEGER DEFAULT 0;
  DECLARE V_RCV     CHAR(32000) FOR BIT DATA;
  DECLARE V_RCVLEN  INTEGER DEFAULT 32000;
  DECLARE V_RTNFILE CHAR(20) DEFAULT ' ';
  DECLARE V_FMT     CHAR(8)  DEFAULT 'FILD0200';
  DECLARE V_FILE    CHAR(20) DEFAULT 'TESTPF    SDATST    ';
  DECLARE V_RECFMT  CHAR(10) DEFAULT '*FIRST    ';
  DECLARE V_OVR     CHAR(1)  DEFAULT '0';
  DECLARE V_SYS     CHAR(10) DEFAULT '*LCL      ';
  DECLARE V_TYPE    CHAR(10) DEFAULT '*EXT      ';
  DECLARE V_ERR     CHAR(16) FOR BIT DATA DEFAULT X'00000010000000000000000000000000';
  DECLARE C1 CURSOR WITH RETURN FOR
    SELECT 'SQLCODE=' || CHAR(V_CODE) || ' ERR=' || HEX(V_ERR) || ' HEAD=' || HEX(SUBSTR(V_RCV, 1, 16)) AS DIAG
      FROM SYSIBM.SYSDUMMY1;
  SET V_RCV = X'DEADBEEFDEADBEEF';
  CALL QTEMP.QDBRTVFD_X(V_RCV, V_RCVLEN, V_RTNFILE, V_FMT, V_FILE, V_RECFMT, V_OVR, V_SYS, V_TYPE, V_ERR);
  SET V_CODE = SQLCODE;
  OPEN C1;
END;

CALL QTEMP.RTVFD_DIAG3();

CALL QSYS2.QCMDEXC('DLTLIB LIB(SDATST)');--I-116 additional captures (round 2) - to fill the gaps listed in keywordFixes.md I-116:
--COMP operators (only GT numeric / EQ character captured so far), the remaining CHECK codes
--(M11, M10F, M11F, VNE), VALUES on a decimal field, an F field with no FLTPCN (implicit vs the
--explicit FLTPCN(*SINGLE)/(*DOUBLE) already captured), and a keyed file. Same SDATST library
--and QDDSSRC file as Block B; run this after that setup (or after CRTLIB/CRTSRCPF again if
--SDATST/QDDSSRC was deleted). If any CRTPF below fails, paste the CPD messages back exactly
--like the first round - the DDS here has not been tried on a real system yet.

CALL QSYS2.QCMDEXC('ADDPFM FILE(SDATST/QDDSSRC) MBR(TESTPF2) SRCTYPE(PF)');
CALL QSYS2.QCMDEXC('ADDPFM FILE(SDATST/QDDSSRC) MBR(TESTPFK) SRCTYPE(PF)');
CREATE OR REPLACE ALIAS SDATST.QDDSSRC_TESTPF2 FOR SDATST.QDDSSRC (TESTPF2);
CREATE OR REPLACE ALIAS SDATST.QDDSSRC_TESTPFK FOR SDATST.QDDSSRC (TESTPFK);
DELETE FROM SDATST.QDDSSRC_TESTPF2;
DELETE FROM SDATST.QDDSSRC_TESTPFK;

--TESTPF2: the remaining CHECK codes, the other COMP operators, VALUES on a decimal field,
--and an F field with no FLTPCN at all (compare its capture with FLDSGL/FLDDBL in Block B,
--which both used an explicit FLTPCN matching the default for their digits).
INSERT INTO SDATST.QDDSSRC_TESTPF2 (SRCSEQ, SRCDAT, SRCDTA) VALUES
  (1, 0, '     A          R TESTFMT2'),
  (2, 0, '     A            FLDM11         6S 0       CHECK(M11)'),
  (3, 0, '     A            FLDM10F        6S 0       CHECK(M10F)'),
  (4, 0, '     A            FLDM11F        6S 0       CHECK(M11F)'),
  (5, 0, '     A            FLDVNE        20A         CHECK(VNE)'),
  (6, 0, '     A            FLDCOMPNE      5S 0       COMP(NE 0)'),
  (7, 0, '     A            FLDCOMPLT      5S 0       COMP(LT 50)'),
  (8, 0, '     A            FLDCOMPNL      5S 0       COMP(NL 10)'),
  (9, 0, '     A            FLDCOMPNG      5S 0       COMP(NG 200)'),
  (10, 0, '     A            FLDCOMPLE      5S 0       COMP(LE 75)'),
  (11, 0, '     A            FLDCOMPGE      5S 0       COMP(GE 5)'),
  (12, 0, '     A            FLDCOMPGTC     3A         COMP(GT ''AAA'')'),
  (13, 0, '     A            FLDCOMPNEC     3A         COMP(NE ''BBB'')'),
  (14, 0, '     A            FLDVALSDEC     7S 2       VALUES(1.50 2.75 -3.25)'),
  (15, 0, '     A            FLDFLTIMPL     7F 2');
CALL QSYS2.QCMDEXC('CRTPF FILE(SDATST/TESTPF2) SRCFILE(SDATST/QDDSSRC) SRCMBR(TESTPF2)');

--TESTPFK: the same 16 fields as the passing TESTPF insert in Block B, plus a K spec, so the
--capture includes whatever FILD0200 puts after the field entries for a keyed file (the parser
--currently reads only the fields and ignores anything after them).
INSERT INTO SDATST.QDDSSRC_TESTPFK (SRCSEQ, SRCDAT, SRCDTA) VALUES
  (1, 0, '     A          R TESTFMT'),
  (2, 0, '     A            FLDME         10A         CHECK(ME)'),
  (3, 0, '     A            FLDRANGE       5S 0       RANGE(1 99999)'),
  (4, 0, '     A            FLDVALS        1A         VALUES(''A'' ''B'' ''C'')'),
  (5, 0, '     A            FLDCOMP        7P 2       COMP(GT 0)'),
  (6, 0, '     A            FLDCOMPC       3A         COMP(EQ ''XYZ'')'),
  (7, 0, '     A            FLDNEG         7S 2       RANGE(-5.5 100.25)'),
  (8, 0, '     A            FLDM10         6S 0       CHECK(M10)'),
  (9, 0, '     A            FLDVN          9A         CHECK(VN)'),
  (10, 0, '     A            FLDAB          5A         VALUES(''A'' ''B'')'),
  (11, 0, '     A                                      CHECK(AB)'),
  (12, 0, '     A            FLDMSG         5S 0       RANGE(10 20)'),
  (13, 0, '     A                                      CHKMSGID(CPF9897 QSYS/QCPFMSG)'),
  (14, 0, '     A            FLDMSGD        5S 0       VALUES(1 2 3)'),
  (15, 0, '     A                                      CHKMSGID(CPF9897 QCPFMSG &FLDDTA)'),
  (16, 0, '     A            FLDDTA        20A'),
  (17, 0, '     A            FLDMULT        5S 0       RANGE(1 99)'),
  (18, 0, '     A                                      CHECK(ME)'),
  (19, 0, '     A            FLDSGL         7F 2       FLTPCN(*SINGLE)'),
  (20, 0, '     A            FLDDBL        15F 2       FLTPCN(*DOUBLE)'),
  (21, 0, '     A            FLDNONE        5A'),
  (22, 0, '     A          K FLDME');
CALL QSYS2.QCMDEXC('CRTPF FILE(SDATST/TESTPFK) SRCFILE(SDATST/QDDSSRC) SRCMBR(TESTPFK)');

--Step 2 (from Block B) still needed - please run these and share the result rows, not just
--confirmation that they ran:
--  SELECT OS_VERSION, OS_RELEASE FROM SYSIBMADM.ENV_SYS_INFO;
--  SELECT CURRENT_NUMERIC_VALUE AS QCCSID FROM QSYS2.SYSTEM_VALUE_INFO WHERE SYSTEM_VALUE_NAME = 'QCCSID';
--  CALL QSYS2.QCMDEXC('DSPFFD FILE(SDATST/TESTPF) OUTPUT(*OUTFILE) OUTFILE(SDATST/FFDOUT)');
--  SELECT WHFLDI, WHFLDT, WHFLDB, WHFLDD, WHFLDP, WHVCNE, WHCSID, WHECDE FROM SDATST.FFDOUT ORDER BY WHFOBO;

--Capture procedure, generalized from Block B's QDBRTVFD_X / RTVFD_DIAG2 so it is not repeated
--three times. P_FILE is padded to the 10-character library-qualified NAME format QDBRTVFD wants;
--library is left as SDATST. Same LANGUAGE CL wrapper as Block B (QTEMP is refused; a plain CALL
--to QSYS.QDBRTVFD from SQL did not return data either - see RTVFD_DIAG/RTVFD_DIAG3 above).
CREATE OR REPLACE PROCEDURE SDATST.RTVFD_DUMP (IN P_FILE CHAR(10))
  LANGUAGE SQL
  RESULT SETS 1
BEGIN
  DECLARE V_RCV     CHAR(32000) FOR BIT DATA;
  DECLARE V_RCVLEN  INTEGER DEFAULT 32000;
  DECLARE V_RTNFILE CHAR(20) DEFAULT ' ';
  DECLARE V_FMT     CHAR(8)  DEFAULT 'FILD0200';
  DECLARE V_FILE    CHAR(20) DEFAULT CAST(P_FILE AS CHAR(10)) || 'SDATST    ';
  DECLARE V_RECFMT  CHAR(10) DEFAULT '*FIRST    ';
  DECLARE V_OVR     CHAR(1)  DEFAULT '0';
  DECLARE V_SYS     CHAR(10) DEFAULT '*LCL      ';
  DECLARE V_TYPE    CHAR(10) DEFAULT '*EXT      ';
  DECLARE V_ERR     CHAR(16) FOR BIT DATA DEFAULT X'00000010000000000000000000000000';
  DECLARE C1 CURSOR WITH RETURN FOR
    WITH T(N) AS (VALUES 0 UNION ALL SELECT N + 1 FROM T WHERE N < 127)
    SELECT 'RCV' AS K, N * 64 AS OFFSET, HEX(SUBSTR(V_RCV, N * 64 + 1, 64)) AS HEXDATA
      FROM T ORDER BY N;

  CALL SDATST.QDBRTVFD_X(V_RCV, V_RCVLEN, V_RTNFILE, V_FMT, V_FILE, V_RECFMT, V_OVR, V_SYS, V_TYPE, V_ERR);
  OPEN C1;
END;

--Run each of these separately and save the RCV rows to their own text file, same shape as Block B.txt
--(SRCSEQ/K column, OFFSET, HEXDATA), so the file name tells us which capture is which:
CALL SDATST.RTVFD_DUMP('TESTPF2   ');
CALL SDATST.RTVFD_DUMP('TESTPFK   ');
